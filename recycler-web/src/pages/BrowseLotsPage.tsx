import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { Card, EmptyView, ErrorView, LoadingView, StatusBadge } from '../components/StateViews'
import { Layout } from '../components/Layout'
import { useAuth } from '../features/auth/AuthContext'
import { lotsRepository } from '../features/lots/lotsRepository'
import type { Lot } from '../types/domain'

export function BrowseLotsPage() {
  const { session } = useAuth()
  const [lots, setLots] = useState<Lot[]>([])
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
      setLots(await lotsRepository.listListedForBidding(session.accessToken))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load available lots.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout approved>
      <h1>Available Lots</h1>
      <p className="hint">Every lot currently open for bidding, from any RRR Centre.</p>
      {loading && <LoadingView />}
      {error && <ErrorView message={error} onRetry={load} />}
      {!loading && !error && lots.length === 0 && (
        <EmptyView message="No lots are currently open for bidding." />
      )}
      {lots.map((lot) => (
        <Link key={lot.lot_id} to={`/lots/${lot.lot_id}`} className="lot-card-link">
          <Card>
            <p>
              <strong>{lot.category}</strong> — {lot.item_ids.length} item{lot.item_ids.length === 1 ? '' : 's'}
            </p>
            <p className="hint">Ward: {lot.ward_id}</p>
            {lot.bid_deadline && (
              <p className="hint">Bid deadline: {new Date(lot.bid_deadline).toLocaleString()}</p>
            )}
            <StatusBadge status={lot.status} />
          </Card>
        </Link>
      ))}
    </Layout>
  )
}
