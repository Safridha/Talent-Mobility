import { Compass } from 'lucide-react'
import Brand from './Brand'
import { goTo } from '../usePathRoute'

export default function NotFoundPage({ embedded = false, homePath = '/', homeLabel = 'Kembali ke beranda' }) {
  const card = (
    <section aria-labelledby="not-found-title" className="not-found-card" role="alert">
      <span aria-hidden="true" className="not-found-icon"><Compass size={30} /></span>
      <p className="not-found-code">404</p>
      <h1 id="not-found-title">Halaman tidak ditemukan</h1>
      <p className="not-found-text">
        Alamat yang Anda tuju tidak tersedia atau Anda tidak memiliki akses ke halaman ini.
      </p>
      <button className="apply-button" onClick={() => goTo(homePath)} type="button">{homeLabel}</button>
    </section>
  )
  if (embedded) return <div className="not-found-embedded">{card}</div>
  return (
    <main className="app-shell">
      <header className="site-header"><div className="header-inner"><Brand /></div></header>
      <div className="page-content not-found-page">{card}</div>
    </main>
  )
}
