import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

/**
 * The RRR-only nav — this app has no route to anything outside the RRR
 * workflow (no Home User/Collector screens exist here at all; this is a
 * physically separate SPA, per the architecture's frontend-isolation
 * decision). Action links only render once the account is APPROVED,
 * which callers pass in explicitly (the dashboard is the one place that
 * knows the current approval status).
 */
export function Layout({ children, approved = false }: { children: ReactNode; approved?: boolean }) {
  const { session, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          Kabadiwala Connect — RRR Centre
        </Link>
        {session && (
          <nav>
            <Link to="/">Dashboard</Link>
            {approved && (
              <>
                <Link to="/receive">Receive</Link>
                <Link to="/classify">Classify</Link>
                <Link to="/build-lot">Build Lot</Link>
                <Link to="/lots">My Lots</Link>
              </>
            )}
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
