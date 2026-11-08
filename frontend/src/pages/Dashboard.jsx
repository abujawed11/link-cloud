import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import UrlForm from '../components/UrlForm'
import JobList from '../components/JobList'
import FileList from '../components/FileList'
import UsageBar from '../components/UsageBar'
import useJobStream from '../hooks/useJobStream'

// SSE carries live progress; polling is the fallback and also catches rows that
// changed while the stream was down.
const POLL_MS = 8000

export default function Dashboard({ user, onLogout, onUnauthorized }) {
  const [jobs, setJobs] = useState([])
  const [files, setFiles] = useState([])
  const [usage, setUsage] = useState(null)
  const doneCount = useRef(0)

  const loadFiles = useCallback(async () => {
    try {
      setFiles((await api('/files')).files)
      setUsage(await api('/jobs/usage'))
    } catch (err) {
      if (err.status === 401) onUnauthorized()
    }
  }, [onUnauthorized])

  const loadJobs = useCallback(async () => {
    try {
      const { jobs: list } = await api('/jobs')
      setJobs(list)
      // Refresh the file list whenever a download finishes
      const done = list.filter((j) => j.status === 'done').length
      if (done !== doneCount.current) {
        doneCount.current = done
        loadFiles()
      }
    } catch (err) {
      if (err.status === 401) onUnauthorized()
    }
  }, [loadFiles, onUnauthorized])

  // Merge a live snapshot into the job we already have.
  const applyProgress = useCallback(
    (snap) => {
      setJobs((current) => {
        const index = current.findIndex((j) => Number(j.id) === Number(snap.id))
        if (index === -1) {
          loadJobs() // a job we have not seen yet
          return current
        }
        const next = [...current]
        next[index] = { ...next[index], ...snap }
        return next
      })
      if (snap.status === 'done') loadFiles()
    },
    [loadJobs, loadFiles]
  )

  useJobStream(applyProgress)

  useEffect(() => {
    loadJobs()
    loadFiles()
    const timer = setInterval(loadJobs, POLL_MS)
    return () => clearInterval(timer)
  }, [loadJobs, loadFiles])

  return (
    <main className="app">
      <header className="topbar">
        <h1>Link Cloud</h1>
        <span>
          <span className="muted">{user.email}</span>{' '}
          <button type="button" className="link" onClick={onLogout}>
            Log out
          </button>
        </span>
      </header>
      <UrlForm onCreated={loadJobs} usage={usage} />
      <UsageBar usage={usage} />
      <JobList jobs={jobs} onChanged={loadJobs} />
      <FileList files={files} onChanged={loadFiles} />
    </main>
  )
}
