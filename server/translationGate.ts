/** One paced provider lane shared by README streams in this server instance. */
export class TranslationGate {
  private tail: Promise<void> = Promise.resolve()
  private nextAt = 0
  private queued = 0
  private interval: number
  private now: () => number
  private sleep: (ms: number, signal?: AbortSignal) => Promise<void>

  constructor(interval = 750, now = Date.now, sleep = waitForTranslation) {
    this.interval = interval
    this.now = now
    this.sleep = sleep
  }

  defer(milliseconds: number) {
    this.nextAt = Math.max(this.nextAt, this.now() + milliseconds)
  }

  async run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    signal.throwIfAborted()
    if (this.queued >= 32) throw new Error('Translation queue is full')
    this.queued++
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    try {
      await abortable(previous, signal)
      // A different request may extend the shared cooldown while this one waits.
      while (this.nextAt > this.now()) await this.sleep(this.nextAt - this.now(), signal)
      signal.throwIfAborted()
      try { return await task() } finally { this.nextAt = Math.max(this.nextAt, this.now() + this.interval) }
    } finally {
      this.queued--
      // Do not let a cancelled waiter release the lane before its predecessor.
      void previous.finally(release)
    }
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
  })
}

export function waitForTranslation(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(signal?.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve() }, ms)
    signal?.addEventListener('abort', cancel, { once: true })
  })
}
