import { formatBytes } from '../utils/format'

function JobRow({ job }) {
  const pct = job.status === 'done' ? 100 : job.progress
  return (
    <li className="item">
      <div className="item-main">
        <span className="url" title={job.url}>
          {job.url}
        </span>
        <span className={`badge ${job.status}`}>{job.status}</span>
      </div>
      {job.status === 'downloading' && (
        <div className="progress">
          <div className="bar" style={{ width: `${pct}%` }} />
          <span className="progress-text">
            {formatBytes(job.bytes_downloaded)}
            {job.bytes_total ? ` / ${formatBytes(job.bytes_total)} (${pct}%)` : ''}
          </span>
        </div>
      )}
      {job.status === 'failed' && <p className="err small">{job.error}</p>}
    </li>
  )
}

export default function JobList({ jobs }) {
  return (
    <section className="card">
      <h2>Downloads</h2>
      {jobs.length === 0 ? (
        <p className="muted">No downloads yet.</p>
      ) : (
        <ul className="list">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </section>
  )
}
