import { useEffect, useState } from 'react'
import { api } from './api/client'
import './App.css'

function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api('/health').then(setHealth).catch((e) => setError(e.message))
  }, [])

  return (
    <main className="app">
      <h1>Link Cloud</h1>
      {error && <p className="err">API unreachable: {error}</p>}
      {health && (
        <p>
          API: {health.status} | Database: {health.db}
        </p>
      )}
      {!health && !error && <p>Checking API...</p>}
    </main>
  )
}

export default App
