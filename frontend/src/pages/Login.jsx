import { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function Login({ onAuthed }) {
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/auth/status')
      .then((s) => {
        setRegistrationOpen(s.registrationOpen)
        // First run: no account exists yet, so go straight to sign-up
        if (s.registrationOpen) setMode('register')
      })
      .catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { user } = await api(`/auth/${mode}`, { body: { email, password } })
      onAuthed(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app narrow">
      <h1>Link Cloud</h1>
      <form className="card" onSubmit={submit}>
        <h2>{mode === 'register' ? 'Create account' : 'Log in'}</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
        />
        {error && <p className="err">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait...' : mode === 'register' ? 'Create account' : 'Log in'}
        </button>
        {registrationOpen && (
          <button
            type="button"
            className="link"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
          </button>
        )}
      </form>
    </main>
  )
}
