import { useState } from 'react'
import { api } from '../api/client'
import { formatBytes, formatDate } from '../utils/format'

export default function FileList({ files, onChanged }) {
  const [error, setError] = useState('')

  async function remove(file) {
    if (!window.confirm(`Delete "${file.original_name}" from the server?`)) return
    setError('')
    try {
      await api(`/files/${file.id}`, { method: 'DELETE' })
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="card">
      <h2>Files on server</h2>
      {error && <p className="err">{error}</p>}
      {files.length === 0 ? (
        <p className="muted">No files stored yet.</p>
      ) : (
        <ul className="list">
          {files.map((f) => (
            <li className="item" key={f.id}>
              <div className="item-main">
                <span className="url" title={f.original_name}>
                  {f.original_name}
                </span>
                <span className="actions">
                  <a className="btn" href={`/api/files/${f.id}/download`}>
                    Download
                  </a>
                  <button type="button" className="danger" onClick={() => remove(f)}>
                    Delete
                  </button>
                </span>
              </div>
              <p className="muted small">
                {formatBytes(f.size_bytes)} &middot; {formatDate(f.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
