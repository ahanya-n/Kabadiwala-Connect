import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { Card, ErrorView, LoadingView, StatusBadge } from '../components/StateViews'
import { Layout } from '../components/Layout'
import { useAuth } from '../features/auth/AuthContext'
import { recyclerRepository } from '../features/recycler/recyclerRepository'
import type { RecyclerProfile } from '../types/domain'

export function DashboardPage() {
  const { session } = useAuth()
  const [profile, setProfile] = useState<RecyclerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadProfile()
  }, [])

  async function loadProfile() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const p = await recyclerRepository.getProfile(session.accessToken)
      setProfile(p)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your profile.')
    } finally {
      setLoading(false)
    }
  }

  const approved = profile?.status === 'APPROVED'

  return (
    <Layout approved={approved}>
      <h1>Dashboard</h1>
      {loading && <LoadingView message="Loading your profile…" />}
      {error && <ErrorView message={error} onRetry={loadProfile} />}
      {profile && (
        <>
          <Card>
            <h2>{profile.company_name}</h2>
            <p>
              <strong>License ID:</strong> {profile.license_id}
            </p>
            <p>
              <strong>Username:</strong> {profile.username}
            </p>
            <p>
              <strong>Status:</strong> <StatusBadge status={profile.status} />
            </p>
          </Card>

          {profile.status === 'PENDING' && (
            <Card>
              <p>
                Your registration is awaiting Government approval. Browsing lots and placing bids are disabled
                until an admin approves your recycler account.
              </p>
            </Card>
          )}
          {profile.status === 'REJECTED' && (
            <Card>
              <p>Your registration was rejected by the Government Admin. Please contact them for details.</p>
            </Card>
          )}
          {approved && (
            <div className="quick-links">
              <Link to="/lots">Browse Available Lots</Link>
              <Link to="/my-bids">My Bids</Link>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
