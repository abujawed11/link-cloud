import { formatBytes } from '../utils/format'

export default function UsageBar({ usage }) {
  if (!usage) return null
  const { used_bytes: used, quota_bytes: quota, max_file_bytes: maxFile } = usage
  const pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0

  return (
    <section className="card">
      <h2>Storage</h2>
      {quota ? (
        <>
          <div className="progress">
            <div className={`bar ${pct >= 90 ? 'bar-warn' : ''}`} style={{ width: `${pct}%` }} />
            <span className="progress-text">
              {formatBytes(used)} / {formatBytes(quota)} ({pct}%)
            </span>
          </div>
          {pct >= 90 && <p className="err small">Almost full. Delete files to free space.</p>}
        </>
      ) : (
        <p className="muted small">{formatBytes(used)} used (no quota set)</p>
      )}
      <p className="muted small">
        Max file size {formatBytes(maxFile)} &middot; up to {usage.max_concurrent} downloads at once
        {usage.server_free_bytes
          ? ` · ${formatBytes(usage.server_free_bytes)} free on the server`
          : ''}
      </p>
    </section>
  )
}
