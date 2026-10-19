import React from 'react'
import ReactDOM from 'react-dom/client'
import Pardner from './Pardner'

class StartupBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main className="connection" role="alert">
      <h1>Pardner could not open</h1>
      <p>Allow browser site storage, then reload. If this continues, check that the service and browser build are up to date.</p>
      <button onClick={() => location.reload()}>Reload Pardner</button>
    </main>
    return this.props.children
  }
}

function App() {
  React.useEffect(() => { document.getElementById('startup')?.remove() }, [])
  return <StartupBoundary><Pardner /></StartupBoundary>
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
