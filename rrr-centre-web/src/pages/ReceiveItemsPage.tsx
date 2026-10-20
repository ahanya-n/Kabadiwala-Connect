import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { generateIdempotencyKey } from '../api/idempotencyKey'
import { Card, EmptyView, ErrorView, LoadingView } from '../components/StateViews'
import { Layout } from '../components/Layout'
import { useAuth } from '../features/auth/AuthContext'
import { ewasteRepository } from '../features/ewaste/ewasteRepository'
import type { Submission } from '../types/domain'

export function ReceiveItemsPage() {
  const { session } = useAuth()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // One idempotency key per in-flight attempt, reused if that same
  // attempt is retried — a fresh key only once an attempt truly ends
  // (success, or the item leaves this screen).
  const pendingKeys = useRef<Record<string, string>>({})

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      setSubmissions(await ewasteRepository.listAwaitingReceipt(session.accessToken))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load items awaiting receipt.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReceive(submissionId: string) {
    if (!session) return
    setActioningId(submissionId)
    setActionError(null)
    const key = pendingKeys.current[submissionId] ?? generateIdempotencyKey()
    pendingKeys.current[submissionId] = key
    try {
      await ewasteRepository.receive(submissionId, session.accessToken, key)
      delete pendingKeys.current[submissionId]
      await load()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not receive this item.')
    } finally {
      setActioningId(null)
    }
  }

  return (
    <Layout approved>
      <h1>Receive Items</h1>
      <p className="hint">Items collected in your ward, awaiting receipt at your centre.</p>
      {actionError && <p className="inline-error-banner">{actionError}</p>}
      {loading && <LoadingView />}
      {error && <ErrorView message={error} onRetry={load} />}
      {!loading && !error && submissions.length === 0 && (
        <EmptyView message="No items are currently awaiting receipt." />
      )}
      {submissions.map((s) => (
        <Card key={s.submission_id}>
          <p>
            <strong>Submission:</strong> {s.submission_id.slice(0, 8)}…
          </p>
          {s.home_ts && (
            <p>
              <strong>Collected/submitted:</strong> {s.home_ts}
            </p>
          )}
          <button type="button" disabled={actioningId === s.submission_id} onClick={() => void handleReceive(s.submission_id)}>
            {actioningId === s.submission_id ? 'Receiving…' : 'Mark Received'}
          </button>
        </Card>
      ))}
    </Layout>
  )
}
