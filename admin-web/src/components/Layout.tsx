import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

/** Government-Admin-only nav — this app has no route to anything outside
 * the admin workflow. */
export function Layout({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          Kabadiwala Connect — Government Admin
        </Link>
        {session && (
          <nav>
            <Link to="/">Dashboard</Link>
            <Link to="/rrr-centres">RRR Centres</Link>
            <Link to="/recyclers">Recyclers</Link>
            <Link to="/collectors">Collectors</Link>
            <Link to="/wards">Wards</Link>
            <Link to="/operations">Operations</Link>
            <Link to="/lots-bids">Lots &amp; Bids</Link>
            <Link to="/rewards">Rewards</Link>
            <Link to="/complaints">Complaints</Link>
            <Link to="/audit-logs">Audit Logs</Link>
            <button type="button" className="link-button" onClick={() => void logout()}>
              Logout
            </button>
          </nav>
        )}
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
