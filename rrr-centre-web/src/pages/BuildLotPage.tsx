import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { generateIdempotencyKey } from '../api/idempotencyKey'
import { Card, EmptyView, ErrorView, InlineErrorBanner, LoadingView } from '../components/StateViews'
import { Layout } from '../components/Layout'
import { useAuth } from '../features/auth/AuthContext'
import { ewasteRepository } from '../features/ewaste/ewasteRepository'
import { lotsRepository } from '../features/lots/lotsRepository'
import type { Submission } from '../types/domain'

export function BuildLotPage() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => generateIdempotencyKey())

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const list = await ewasteRepository.listClassified(session.accessToken)
      setSubmissions(list)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load classified items.')
    } finally {
      setLoading(false)
    }
  }

  const categories = useMemo(
    () => Array.from(new Set(submissions.map((s) => s.category).filter((c): c is string => Boolean(c)))),
    [submissions],
  )
  const itemsInCategory = useMemo(
    () => submissions.filter((s) => s.category === selectedCategory),
    [submissions, selectedCategory],
  )

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreateLot() {
    if (!session || !selectedCategory || selectedIds.size === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const lot = await lotsRepository.createLot(
        selectedCategory,
        Array.from(selectedIds),
        session.accessToken,
        idempotencyKey,
      )
      navigate(`/lots/${lot.lot_id}`)
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not create the lot.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout approved>
      <h1>Build a Lot</h1>
      <p className="hint">Group classified items of the same category into one lot to publish for bidding.</p>
      {loading && <LoadingView />}
      {error && <ErrorView message={error} onRetry={load} />}
      {!loading && !error && submissions.length === 0 && (
        <EmptyView message="No classified items are available to lot yet." />
      )}
      {!loading && !error && submissions.length > 0 && (
        <>
          <label>
            Category
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value)
                setSelectedIds(new Set())
              }}
            >
              <option value="">Select a category…</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {selectedCategory && (
            <>
              {itemsInCategory.map((s) => (
                <Card key={s.submission_id}>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.submission_id)}
                      onChange={() => toggleSelected(s.submission_id)}
                    />
                    Submission {s.submission_id.slice(0, 8)}…
                  </label>
                </Card>
              ))}

              {submitError && <InlineErrorBanner message={submitError} />}
              <button type="button" disabled={submitting || selectedIds.size === 0} onClick={() => void handleCreateLot()}>
                {submitting ? 'Creating…' : `Create Lot (${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'})`}
              </button>
            </>
          )}
        </>
      )}
    </Layout>
  )
}
