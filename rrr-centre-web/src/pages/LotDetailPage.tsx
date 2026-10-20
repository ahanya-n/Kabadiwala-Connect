import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { generateIdempotencyKey } from '../api/idempotencyKey'
import { Card, ErrorView, InlineErrorBanner, LoadingView, StatusBadge } from '../components/StateViews'
import { Layout } from '../components/Layout'
import { useAuth } from '../features/auth/AuthContext'
import { lotsRepository } from '../features/lots/lotsRepository'
import type { Lot } from '../types/domain'

export function LotDetailPage() {
  const { lotId } = useParams<{ lotId: string }>()
  const { session } = useAuth()
  const [lot, setLot] = useState<Lot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => generateIdempotencyKey())

  useEffect(() => {
    void load()
  }, [lotId])

  async function load() {
    if (!session || !lotId) return
    setLoading(true)
    setError(null)
    try {
      setLot(await lotsRepository.getLot(lotId, session.accessToken))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this lot.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePublish() {
    if (!session || !lotId) return
    setPublishing(true)
    setPublishError(null)
    try {
      const updated = await lotsRepository.publishLot(lotId, session.accessToken, idempotencyKey)
      setLot(updated)
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Could not publish this lot.')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Layout approved>
      <h1>Lot Detail</h1>
      {loading && <LoadingView />}
      {error && <ErrorView message={error} onRetry={load} />}
      {lot && (
        <Card>
          <p>
            <strong>Lot ID:</strong> {lot.lot_id}
          </p>
          <p>
            <strong>Category:</strong> {lot.category}
          </p>
          <p>
            <strong>Items:</strong> {lot.item_ids.length}
          </p>
          {lot.total_weight_kg != null && (
            <p>
              <strong>Collected weight:</strong> {lot.total_weight_kg.toFixed(2)} kg
            </p>
          )}
          <p>
            <strong>Status:</strong> <StatusBadge status={lot.status} />
          </p>
          {lot.bid_deadline && (
            <p>
              <strong>Bid deadline:</strong> {new Date(lot.bid_deadline).toLocaleString()}
            </p>
          )}

          {lot.status === 'DRAFT' && (
            <>
              {publishError && <InlineErrorBanner message={publishError} />}
              <button type="button" disabled={publishing} onClick={() => void handlePublish()}>
                {publishing ? 'Publishing…' : 'Publish for Bidding'}
              </button>
            </>
          )}
          {lot.status === 'LISTED_FOR_BIDDING' && (
            <p className="hint">
              This lot is listed for bidding. Recycler bidding itself is a later phase — this demo stops here.
            </p>
          )}
        </Card>
      )}
    </Layout>
  )
}
