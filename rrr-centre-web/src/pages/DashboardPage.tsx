import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { Card, ErrorView, LoadingView, StatusBadge } from '../components/StateViews'
import { Layout } from '../components/Layout'
import { useAuth } from '../features/auth/AuthContext'
import { rrrCentreRepository } from '../features/rrrCentre/rrrCentreRepository'
import type { RrrCentreProfile } from '../types/domain'

export function DashboardPage() {
  const { session } = useAuth()
  const [profile, setProfile] = useState<RrrCentreProfile | null>(null)
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
      const p = await rrrCentreRepository.getProfile(session.accessToken)
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
            <h2>{profile.rrr_id}</h2>
            <p>
              <strong>Username:</strong> {profile.username}
            </p>
            <p>
              <strong>Tender ID:</strong> {profile.tender_id}
            </p>
            <p>
              <strong>Ward:</strong> {profile.ward_id}
            </p>
            <p>
              <strong>Status:</strong> <StatusBadge status={profile.status} />
            </p>
          </Card>

          {profile.status === 'PENDING' && (
            <Card>
              <p>
                Your registration is awaiting Government approval. Receiving, classifying, and lotting e-waste are
                disabled until an admin approves your RRR Centre for ward {profile.ward_id}.
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
              <Link to="/receive">Receive Items</Link>
              <Link to="/classify">Classify Items</Link>
              <Link to="/build-lot">Build a Lot</Link>
              <Link to="/lots">My Lots</Link>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
