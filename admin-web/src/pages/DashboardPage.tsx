import { useEffect, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { Layout } from '../components/Layout'
import { ErrorView, LoadingView } from '../components/StateViews'
import { adminRepository } from '../features/admin/adminRepository'
import { useAuth } from '../features/auth/AuthContext'
import type { DashboardSummary } from '../types/domain'

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-tile">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  )
}

function statusBreakdown(byStatus: Record<string, number>): string {
  const entries = Object.entries(byStatus)
  if (entries.length === 0) return 'none yet'
  return entries.map(([status, count]) => `${status}: ${count}`).join(' · ')
}

export function DashboardPage() {
  const { session } = useAuth()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      setSummary(await adminRepository.getDashboardSummary(session.accessToken))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the dashboard summary.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <h1>Dashboard</h1>
      {loading && <LoadingView message="Loading summary…" />}
      {error && <ErrorView message={error} onRetry={load} />}
      {summary && (
        <>
          <div className="summary-grid">
            <Tile label="Home Users" value={summary.users_by_role.HOME_USER ?? 0} />
            <Tile label="Collectors" value={summary.users_by_role.COLLECTOR ?? 0} />
            <Tile label="RRR Centres" value={summary.users_by_role.RRR_CENTER ?? 0} />
            <Tile label="Recyclers" value={summary.users_by_role.RECYCLER ?? 0} />
            <Tile label="Wards" value={summary.wards_count} />
            <Tile label="Flagged Submissions" value={summary.flagged_submissions_count} />
          </div>

          <div className="card">
            <h2>RRR Centres by status</h2>
            <p className="hint">{statusBreakdown(summary.rrr_centres_by_status)}</p>
          </div>
          <div className="card">
            <h2>Recyclers by status</h2>
            <p className="hint">{statusBreakdown(summary.recyclers_by_status)}</p>
          </div>
          <div className="card">
            <h2>Submissions by status</h2>
            <p className="hint">{statusBreakdown(summary.submissions_by_status)}</p>
          </div>
          <div className="card">
            <h2>Lots by status</h2>
            <p className="hint">{statusBreakdown(summary.lots_by_status)}</p>
          </div>
          <div className="card">
            <h2>Bids by status</h2>
            <p className="hint">{statusBreakdown(summary.bids_by_status)}</p>
          </div>
          <div className="card">
            <h2>Complaints by status</h2>
            <p className="hint">{statusBreakdown(summary.complaints_by_status)}</p>
          </div>
        </>
      )}
    </Layout>
  )
}
