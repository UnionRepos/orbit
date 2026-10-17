/**
 * Background work that must not delay a response (cache refreshes, edge cache
 * writes). Cloudflare Workers hand out a per-request `waitUntil`; the Node
 * server and tests simply run the task detached.
 */
type Task = Promise<unknown>

let scheduler: (task: Task) => void = (task) => {
  void task.catch(() => {})
}

/** Installs the runtime's scheduler (the Worker entry passes `ctx.waitUntil`). */
export function setBackgroundScheduler(next: (task: Task) => void): void {
  scheduler = next
}

/** Runs `task` after the response is sent, never letting it reject unhandled. */
export function runInBackground(task: Task): void {
  const guarded = task.catch((error: unknown) => {
    console.error('[orbit] background task failed', error)
  })
  try {
    scheduler(guarded)
  } catch {
    // A stale execution context must not break the request.
    void guarded
  }
}
