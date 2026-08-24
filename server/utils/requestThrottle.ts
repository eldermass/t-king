const MIN_REQUEST_INTERVAL_MS = 600

let nextRequestAt = 0
let requestQueue = Promise.resolve()

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export const throttledFetch = <T>(url: string, options?: Parameters<typeof $fetch<T>>[1]) => {
  return throttledTask(() => $fetch<T>(url, options))
}

export const throttledTask = <T>(task: () => Promise<T>) => {
  const request = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now())
    if (delay) await wait(delay)

    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS
    return task()
  })

  requestQueue = request.then(() => undefined, () => undefined)
  return request
}
