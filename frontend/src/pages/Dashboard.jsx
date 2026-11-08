import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import UrlForm from '../components/UrlForm'
import JobList from '../components/JobList'
import FileList from '../components/FileList'

const POLL_MS = 2500

export default function Dashboard({ user, onLogout, onUnauthorized }) {
  const [jobs, setJobs] = useState([])
  const [files, setFiles] = useState([])
  const doneCount = useRef(0)

  const loadFiles = useCallback(async () => {
    try {
      setFiles((await api('/files')).files)
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
      <UrlForm onCreated={loadJobs} />
      <JobList jobs={jobs} />
      <FileList files={files} onChanged={loadFiles} />
    </main>
  )
}
