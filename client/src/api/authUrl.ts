export async function getAuthUrl(url: string, purpose: 'download'): Promise<string> {
  if (!url) return url
  try {
    const resp = await fetch('/api/auth/resource-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ purpose }),
    })
    if (!resp.ok) return url
    const { token } = await resp.json()
    return `${url}${url.includes('?') ? '&' : '?'}token=${token}`
  } catch {
    return url
  }
}

// ── Blob-based image fetching (Safari-safe, no ephemeral tokens needed) ────

const MAX_CONCURRENT = 30
let active = 0
const queue: Array<{ run: () => void; signal?: AbortSignal; active?: boolean; queued?: boolean }> = []

function dequeue() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!
    if (item.signal?.aborted) {
      continue
    }
    active++
    item.active = true
    item.queued = false
    item.run()
  }
}

export function clearImageQueue() {
  queue.length = 0
}

export async function fetchImageAsBlob(url: string, signal?: AbortSignal): Promise<string> {
  if (!url) return ''
  return new Promise<string>((resolve) => {
    const item = {
      run: async () => {
        if (signal?.aborted) {
          resolve('')
          if (!item.queued) {
            active--
            dequeue()
          }
          return
        }

        try {
          const resp = await fetch(url, { credentials: 'include', signal })
          if (!resp.ok) {
            resolve('')
            return
          }
          const blob = await resp.blob()
          if (signal?.aborted) {
            resolve('')
            return
          }
          resolve(URL.createObjectURL(blob))
        } catch {
          resolve('')
        } finally {
          if (!item.queued) {
            active--
            dequeue()
          }
        }
      },
      signal,
      active: false,
      queued: false,
    }

    const onAbort = () => {
      if (!item.active) {
        const index = queue.indexOf(item)
        if (index !== -1) {
          queue.splice(index, 1)
        }
        resolve('')
      }
    }

    signal?.addEventListener('abort', onAbort)
    const finalize = () => signal?.removeEventListener('abort', onAbort)

    const wrappedRun = async () => {
      try {
        await item.run()
      } finally {
        finalize()
      }
    }

    if (active < MAX_CONCURRENT) {
      active++
      item.active = true
      wrappedRun()
    } else {
      item.queued = true
      queue.push(item)
    }
  })
}
