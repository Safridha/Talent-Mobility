import { Component } from 'react'

// Last line of defence: an unexpected error must show a recoverable screen, never a blank page.
export default class RootErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" style={{ display: 'grid', minHeight: '100dvh', placeItems: 'center', padding: 24, background: '#f8fafc', color: '#334155', textAlign: 'center', fontFamily: 'Poppins, sans-serif' }}>
        <div>
          <p style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>Terjadi kendala saat menampilkan halaman.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 18px', border: 0, borderRadius: 10, background: '#2563eb', color: 'white', fontWeight: 600 }} type="button">Muat ulang</button>
        </div>
      </div>
    )
  }
}
