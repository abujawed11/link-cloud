import { useState } from 'react'
import { api } from '../api/client'
import { formatBytes, formatEta, formatSpeed } from '../utils/format'

function JobRow({ job, onChanged }) {
  const [busy, setBusy] = useState(false)
  const active = job.status === 'downloading' || job.status === 'queued'
  const pct = job.status === 'done' ? 100 : Number(job.progress) || 0
  const speed = formatSpeed(job.speed_bps)
  const eta = formatEta(job.bytes_downloaded, job.bytes_total, job.speed_bps)

  async function cancel() {
    setBusy(true)
    try {
      await api(`/jobs/${job.id}/cancel`, { method: 'POST' })
      onChanged()
    } catch {
      /* the list refresh below will show the real state */
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
          {active && (
            <button type="button" className="danger" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          )}
        </span>
      </div>
      {active && (
        <div className="progress">
          <div className={`bar ${job.bytes_total ? '' : 'bar-indeterminate'}`} style={{ width: `${pct}%` }} />
          <span className="progress-text">
            {formatBytes(job.bytes_downloaded)}
            {job.bytes_total ? ` / ${formatBytes(job.bytes_total)} (${pct}%)` : ''}
            {speed ? ` · ${speed}` : ''}
            {eta ? ` · ${eta} left` : ''}
          </span>
        </div>
      )}
      {job.status === 'failed' && <p className="err small">{job.error}</p>}
    </li>
  )
}

export default function JobList({ jobs, onChanged }) {
  return (
    <section className="card">
      <h2>Downloads</h2>
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
