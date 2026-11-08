import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  const expired = useCallback(() => setUser(null), [])

  if (loading) return <main className="app"><p className="muted">Loading...</p></main>
  if (!user) return <Login onAuthed={setUser} />
  return <Dashboard user={user} onLogout={logout} onUnauthorized={expired} />
}

export default App
