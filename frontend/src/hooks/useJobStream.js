import { useEffect, useRef } from 'react'

/**
 * Subscribe to /api/jobs/events (Server-Sent Events) for live download progress.
 * The browser reconnects on its own; polling stays in place as a fallback, so a
 * dropped stream only means slower updates, never a stuck progress bar.
 */
export default function useJobStream(onProgress) {
  const handler = useRef(onProgress)

  useEffect(() => {
    handler.current = onProgress
  }, [onProgress])

  useEffect(() => {
    let source
    try {
      source = new EventSource('/api/jobs/events', { withCredentials: true })
    } catch {
      return undefined
    }
    source.addEventListener('progress', (e) => {
      try {
        handler.current(JSON.parse(e.data))
      } catch {
        /* ignore malformed frames */
      }
    })
    return () => source.close()
  }, [])
}
