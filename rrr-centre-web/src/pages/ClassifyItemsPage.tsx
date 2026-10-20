import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { generateIdempotencyKey } from '../api/idempotencyKey'
import { Card, EmptyView, ErrorView, LoadingView, StatusBadge } from '../components/StateViews'
import { Layout } from '../components/Layout'
import { useAuth } from '../features/auth/AuthContext'
import { ewasteRepository } from '../features/ewaste/ewasteRepository'
import type { AiClassifyResult, Submission } from '../types/domain'

const SUGGESTED_CATEGORIES = ['e-waste-small-appliances', 'metal-scrap', 'plastics', 'circuit-boards', 'batteries']

export function ClassifyItemsPage() {
  const { session } = useAuth()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryInputs, setCategoryInputs] = useState<Record<string, string>>({})
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [aiResults, setAiResults] = useState<Record<string, AiClassifyResult>>({})
  const pendingKeys = useRef<Record<string, string>>({})
  const pendingAiKeys = useRef<Record<string, string>>({})

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      setSubmissions(await ewasteRepository.listAwaitingClassification(session.accessToken))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load items awaiting classification.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClassify(submissionId: string) {
    if (!session) return
    const category = (categoryInputs[submissionId] ?? '').trim()
    if (!category) {
      setActionError('Please enter a category before classifying.')
      return
    }
    setActioningId(submissionId)
    setActionError(null)
    const key = pendingKeys.current[submissionId] ?? generateIdempotencyKey()
    pendingKeys.current[submissionId] = key
    try {
      await ewasteRepository.classify(submissionId, category, session.accessToken, key)
      delete pendingKeys.current[submissionId]
      setAiResults((prev) => {
        const next = { ...prev }
        delete next[submissionId]
        return next
      })
      await load()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not classify this item.')
    } finally {
      setActioningId(null)
    }
  }

  async function handleAiClassify(submissionId: string) {
    if (!session) return
    setActioningId(submissionId)
    setActionError(null)
    const key = pendingAiKeys.current[submissionId] ?? generateIdempotencyKey()
    pendingAiKeys.current[submissionId] = key
    try {
      const result = await ewasteRepository.classifyWithAi(submissionId, session.accessToken, key)
      delete pendingAiKeys.current[submissionId]
      setAiResults((prev) => ({ ...prev, [submissionId]: result }))
      if (!result.needs_review) {
        await load()
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'AI classification could not be completed.')
    } finally {
      setActioningId(null)
    }
  }

  return (
    <Layout approved>
      <h1>Classify Items</h1>
      <p className="hint">
        Use AI Classify for an automatic suggestion, or enter a category manually. AI results below a confidence
        threshold (or a failed attempt) are never silently accepted — the item is marked NEEDS_REVIEW and still
        requires a manual category here.
      </p>
      {actionError && <p className="inline-error-banner">{actionError}</p>}
      {loading && <LoadingView />}
      {error && <ErrorView message={error} onRetry={load} />}
      {!loading && !error && submissions.length === 0 && (
        <EmptyView message="No items are currently awaiting classification." />
      )}
      {submissions.map((s) => {
        const aiResult = aiResults[s.submission_id]
        return (
          <Card key={s.submission_id}>
            <p>
              <strong>Submission:</strong> {s.submission_id.slice(0, 8)}…
              {s.status === 'NEEDS_REVIEW' && (
                <>
                  {' '}
                  <StatusBadge status="NEEDS_REVIEW" />
                </>
              )}
            </p>

            <button
              type="button"
              disabled={actioningId === s.submission_id}
              onClick={() => void handleAiClassify(s.submission_id)}
            >
              {actioningId === s.submission_id ? 'Running AI…' : 'AI Classify'}
            </button>

            {aiResult && (
              <div className="card" style={{ marginTop: 8, marginBottom: 8 }}>
                <p>
                  <strong>AI suggestion:</strong> {aiResult.predicted_category ?? '(none — attempt failed)'}
                </p>
                {aiResult.confidence != null && (
                  <p>
                    <strong>Confidence:</strong> {(aiResult.confidence * 100).toFixed(1)}%
                  </p>
                )}
                <p>
                  <strong>Source:</strong> {aiResult.source} ({aiResult.model_version})
                </p>
                {aiResult.needs_review ? (
                  <p className="hint">
                    {aiResult.failure_reason
                      ? `AI classification failed (${aiResult.failure_reason}) — manual review required below.`
                      : 'Confidence below the required threshold — manual review required below.'}
                  </p>
                ) : (
                  <p className="hint">Accepted — this item is now CLASSIFIED.</p>
                )}
              </div>
            )}

            <label>
              Category (manual)
              <input
                list="category-suggestions"
                value={categoryInputs[s.submission_id] ?? ''}
                onChange={(e) => setCategoryInputs((prev) => ({ ...prev, [s.submission_id]: e.target.value }))}
                placeholder="e.g. metal-scrap"
              />
            </label>
            <button
              type="button"
              disabled={actioningId === s.submission_id}
              onClick={() => void handleClassify(s.submission_id)}
            >
              {actioningId === s.submission_id ? 'Classifying…' : 'Classify Manually'}
            </button>
          </Card>
        )
      })}
      <datalist id="category-suggestions">
        {SUGGESTED_CATEGORIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Layout>
  )
}
