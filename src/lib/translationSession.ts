import { TranslationRequestError } from './translation.ts'

export interface TranslationProgress {
  total: number
  completed: number
  pending: number
  failed: number
  retryAt: number
}

type PassageState = 'waiting' | 'running' | 'done' | 'failed'
interface SessionOptions {
  texts: string[]
  translate: (text: string, signal: AbortSignal) => Promise<string>
  onResult: (index: number, text: string) => void
  onProgress: (progress: TranslationProgress) => void
  onStart?: (index: number) => void
  onError?: (index: number) => void
  /** Lower values are nearer the reader's current position. */
  priority?: (index: number) => number
}

/** A README owns one session. Views and retries never discard completed work. */
export class TranslationSession {
  private options: SessionOptions
  private states: PassageState[]
  private controller = new AbortController()
  private paused = true
  private disposed = false
  private retryAt = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(options: SessionOptions) {
    this.options = options
    this.states = options.texts.map(() => 'waiting')
    this.publish()
  }

  pause() { this.paused = true; this.clearTimer() }
  resume() { this.paused = false; this.pump() }

  retry(index?: number) {
    if (this.disposed || Date.now() < this.retryAt) return
    this.states = this.states.map((state, current) => state === 'failed' && (index === undefined || current === index) ? 'waiting' : state)
    this.publish()
    this.pump()
  }

  dispose() {
    this.disposed = true
    this.clearTimer()
    this.controller.abort()
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }

  private publish() {
    if (this.disposed) return
    this.options.onProgress({
      total: this.states.length,
      completed: this.states.filter((state) => state === 'done').length,
      pending: this.states.filter((state) => state === 'running').length,
      failed: this.states.filter((state) => state === 'failed').length,
      retryAt: this.retryAt,
    })
  }

  private pump() {
    if (this.disposed || this.paused) return
    if (Date.now() < this.retryAt) {
      if (!this.timer) this.timer = setTimeout(() => {
        this.timer = undefined
        if (Date.now() >= this.retryAt) this.retryAt = 0
        this.publish()
        this.pump()
      }, this.retryAt - Date.now())
      return
    }
    this.retryAt = 0
    while (this.states.filter((state) => state === 'running').length < 2) {
      let next = -1
      let best = Infinity
      this.states.forEach((state, index) => {
        if (state !== 'waiting') return
        const score = this.options.priority?.(index) ?? index
        if (next < 0 || score < best) { next = index; best = score }
      })
      if (next < 0) break
      this.states[next] = 'running'
      this.options.onStart?.(next)
      this.publish()
      void this.run(next)
    }
  }

  private async run(index: number) {
    try {
      const result = await this.options.translate(this.options.texts[index], this.controller.signal)
      if (this.disposed) return
      this.options.onResult(index, result)
      this.states[index] = 'done'
    } catch (error) {
      if (this.disposed) return
      this.states[index] = 'failed'
      if (error instanceof TranslationRequestError && error.retryAfter > 0) {
        this.retryAt = Math.max(this.retryAt, Date.now() + error.retryAfter * 1000)
      }
      this.options.onError?.(index)
    } finally {
      if (!this.disposed) { this.publish(); this.pump() }
    }
  }
}
