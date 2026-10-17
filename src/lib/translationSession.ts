import type { ReadmePassage, ReadmeTranslationEvent } from '../../shared/translation.ts'
import { TranslationRequestError } from './translation.ts'

export interface TranslationProgress {
  total: number
  completed: number
  pending: number
  failed: number
  retryAt: number
  status: 'idle' | 'running' | 'waiting' | 'unavailable' | 'complete'
}

type PassageState = 'waiting' | 'running' | 'done' | 'failed'
interface SessionOptions {
  texts: string[]
  request: (passages: ReadmePassage[], signal: AbortSignal, emit: (event: ReadmeTranslationEvent) => void) => Promise<void>
  onResult: (index: number, text: string) => void
  onProgress: (progress: TranslationProgress) => void
  onStart?: (index: number) => void
  onError?: (index: number) => void
  priority?: (index: number) => number
  reconnectDelay?: number
}

/** A single resumable stream; completed passages never become retry jobs again. */
export class TranslationSession {
  private options: SessionOptions
  private states: PassageState[]
  private controller: AbortController | null = null
  private paused = true
  private disposed = false
  private retryAt = 0
  private reconnects = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private status: TranslationProgress['status'] = 'idle'

  constructor(options: SessionOptions) {
    this.options = options
    this.states = options.texts.map(() => 'waiting')
    this.publish()
  }

  pause() {
    this.paused = true
    this.clearTimer()
    this.controller?.abort()
    this.publish()
  }
  resume() {
    if (this.disposed) return
    this.paused = false
    if (this.status === 'unavailable' && Date.now() < this.retryAt) { this.publish(); return }
    if (this.status === 'unavailable') { this.status = 'idle'; this.reconnects = 0 }
    this.pump()
  }

  retry(index?: number) {
    if (this.disposed || Date.now() < this.retryAt) return
    this.states = this.states.map((state, current) => state === 'failed' && (index === undefined || current === index) ? 'waiting' : state)
    this.reconnects = 0
    this.status = 'idle'
    this.retryAt = 0
    this.publish()
    this.pump()
  }

  reconnect() {
    if (this.disposed) return
    this.controller?.abort()
    this.retryAt = 0
    this.reconnects = 0
    this.status = 'idle'
    this.clearTimer()
    this.pump()
  }

  dispose() { this.disposed = true; this.clearTimer(); this.controller?.abort() }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = undefined }

  private publish() {
    if (this.disposed) return
    this.options.onProgress({
      total: this.states.length, completed: this.states.filter((state) => state === 'done').length,
      pending: this.states.filter((state) => state === 'running').length,
      failed: this.states.filter((state) => state === 'failed').length,
      retryAt: this.retryAt, status: this.status,
    })
  }

  private pump() {
    if (this.disposed || this.paused || this.controller || this.status === 'unavailable') return
    if (Date.now() < this.retryAt) {
      if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; this.pump() }, this.retryAt - Date.now())
      return
    }
    this.retryAt = 0
    const passages = this.states.flatMap((state, index) => state === 'waiting' ? [{ index, text: this.options.texts[index] }] : [])
      .sort((a, b) => (this.options.priority?.(a.index) ?? a.index) - (this.options.priority?.(b.index) ?? b.index))
    if (!passages.length) { this.status = 'complete'; this.publish(); return }
    const controller = new AbortController()
    this.controller = controller
    this.status = 'running'
    this.publish()
    void this.run(passages, controller)
  }

  private receive(event: ReadmeTranslationEvent, controller: AbortController) {
    if (this.disposed || controller.signal.aborted || this.controller !== controller) return
    if (event.type === 'result' && this.states[event.index] !== 'done') {
      this.options.onResult(event.index, event.text)
      this.states[event.index] = 'done'
      this.status = 'running'
      this.retryAt = 0
    } else if (event.type === 'start' && this.states[event.index] !== 'done') {
      this.states[event.index] = 'running'
      this.options.onStart?.(event.index)
      this.status = 'running'
    } else if (event.type === 'failed') {
      this.states[event.index] = 'failed'
      this.options.onError?.(event.index)
    } else if (event.type === 'waiting') {
      this.status = 'waiting'; this.retryAt = event.retryAt
    } else if (event.type === 'unavailable') {
      this.status = 'unavailable'; this.retryAt = event.retryAt
    }
    this.publish()
  }

  private async run(passages: ReadmePassage[], controller: AbortController) {
    try {
      await this.options.request(passages, controller.signal, (event) => this.receive(event, controller))
      if (!this.disposed && !controller.signal.aborted && this.status !== 'unavailable') this.status = this.states.some((state) => state === 'waiting') ? 'idle' : 'complete'
    } catch (error) {
      if (this.disposed || controller.signal.aborted) return
      // Network reconnects are bounded, and only unfinished passages are resent.
      if (++this.reconnects <= 2) {
        this.status = 'waiting'
        this.retryAt = Date.now() + (error instanceof TranslationRequestError && error.retryAfter > 0 ? error.retryAfter * 1000 : (this.options.reconnectDelay ?? 1500) * this.reconnects)
      } else {
        this.status = 'unavailable'; this.retryAt = Date.now() + 15_000
      }
    } finally {
      if (this.controller === controller) this.controller = null
      this.states = this.states.map((state) => state === 'running' ? 'waiting' : state)
      this.publish()
      if (!this.disposed && this.status !== 'complete') this.pump()
    }
  }
}
