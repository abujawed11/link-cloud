import { useState } from 'react'
import { api } from '../api/client'
import { formatBytes, formatEta, formatSpeed } from '../utils/format'

const CLEARABLE = ['done', 'failed', 'cancelled']

function JobRow({ job, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const live = job.status === 'downloading' || job.status === 'queued'
  const showProgress = live || job.status === 'paused'
  const pct = job.status === 'done' ? 100 : Number(job.progress) || 0
  const speed = formatSpeed(job.speed_bps)
  const eta = formatEta(job.bytes_downloaded, job.bytes_total, job.speed_bps)

  async function act(action, method = 'POST') {
    setBusy(true)
    setActionError('')
    try {
      await api(`/jobs/${job.id}${action ? `/${action}` : ''}`, { method })
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  return (
    <li className="item">
      <div className="item-main">
        <span className="url" title={job.url}>
          {job.url}
        </span>
        <span className="actions">
          <span className={`badge ${job.status}`}>{job.status}</span>
          {job.status === 'downloading' && (
            <button type="button" className="btn" onClick={() => act('pause')} disabled={busy}>
              Pause
            </button>
          )}
          {job.status === 'paused' && (
            <button type="button" className="btn" onClick={() => act('resume')} disabled={busy}>
              Resume
            </button>
          )}
          {job.status === 'failed' && (
            <button type="button" className="btn" onClick={() => act('retry')} disabled={busy}>
              Retry
            </button>
          )}
          {(live || job.status === 'paused') && (
            <button type="button" className="danger" onClick={() => act('cancel')} disabled={busy}>
              Cancel
            </button>
          )}
          {CLEARABLE.includes(job.status) && (
            <button
              type="button"
              className="link"
              title="Remove this entry from the list"
              onClick={() => act('', 'DELETE')}
              disabled={busy}
            >
              Clear
            </button>
          )}
        </span>
      </div>
      {showProgress && (
        <div className="progress">
          <div
            className={`bar ${job.status === 'downloading' && !job.bytes_total ? 'bar-indeterminate' : ''} ${job.status === 'paused' ? 'bar-paused' : ''}`}
            style={{ width: `${pct}%` }}
          />
          <span className="progress-text">
            {formatBytes(job.bytes_downloaded)}
            {job.bytes_total ? ` / ${formatBytes(job.bytes_total)} (${pct}%)` : ''}
            {job.status === 'downloading' && speed ? ` · ${speed}` : ''}
            {job.status === 'downloading' && eta ? ` · ${eta} left` : ''}
            {job.status === 'paused' ? ' · paused' : ''}
          </span>
        </div>
      )}
      {job.status === 'failed' && <p className="err small">{job.error}</p>}
      {actionError && <p className="err small">{actionError}</p>}
    </li>
  )
}

export default function JobList({ jobs, onChanged }) {
  const [clearing, setClearing] = useState(false)
  const anyClearable = jobs.some((j) => CLEARABLE.includes(j.status))

  async function clearFinished() {
    setClearing(true)
    try {
      await api('/jobs/finished', { method: 'DELETE' })
    } catch {
      /* onChanged() below will show whatever state actually remains */
    } finally {
      setClearing(false)
      onChanged()
    }
  }

  return (
    <section className="card">
      <div className="item-main">
        <h2>Downloads</h2>
        {anyClearable && (
          <button type="button" className="link" onClick={clearFinished} disabled={clearing}>
            Clear finished
          </button>
        )}
      </div>
      {jobs.length === 0 ? (
        <p className="muted">No downloads yet.</p>
      ) : (
        <ul className="list">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  )
}
