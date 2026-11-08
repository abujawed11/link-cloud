import { useState } from 'react'
import { api } from '../api/client'
import { formatBytes } from '../utils/format'

export default function UrlForm({ onCreated, usage }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await api('/jobs', { body: { url } })
      setUrl('')
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Download a file to the server</h2>
      <div className="row">
        <input
          type="url"
          placeholder="Paste a direct download URL (https://...)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" disabled={busy || !url}>
          {busy ? 'Starting...' : 'Download'}
        </button>
      </div>
      {error && <p className="err">{error}</p>}
      {usage?.max_file_bytes && (
        <p className="muted small">
          Direct links only (http/https). Up to {formatBytes(usage.max_file_bytes)} per file.
        </p>
      )}
    </form>
  )
}
