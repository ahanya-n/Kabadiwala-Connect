import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

/** Recycler-only nav — this app has no route to anything outside the
 * recycler workflow. Action links only render once APPROVED. */
export function Layout({ children, approved = false }: { children: ReactNode; approved?: boolean }) {
  const { session, logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          Kabadiwala Connect — Recycler
        </Link>
        {session && (
          <nav>
            <Link to="/">Dashboard</Link>
            {approved && (
              <>
                <Link to="/lots">Browse Lots</Link>
                <Link to="/my-bids">My Bids</Link>
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
