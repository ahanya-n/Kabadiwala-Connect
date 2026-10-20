import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { ErrorView, InlineErrorBanner, LoadingView } from '../components/StateViews'
import { useAuth } from '../features/auth/AuthContext'
import { rrrCentreRepository } from '../features/rrrCentre/rrrCentreRepository'
import type { Ward } from '../types/domain'
import { wardsRepository } from '../features/wards/wardsRepository'

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [wards, setWards] = useState<Ward[]>([])
  const [loadingWards, setLoadingWards] = useState(true)
  const [wardsError, setWardsError] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rrrId, setRrrId] = useState('')
  const [tenderId, setTenderId] = useState('')
  const [wardId, setWardId] = useState('')
  const [licenceDocRef, setLicenceDocRef] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    void loadWards()
  }, [])

  async function loadWards() {
    setLoadingWards(true)
    setWardsError(null)
    try {
      const list = await wardsRepository.listWards()
      setWards(list)
      if (list.length > 0) setWardId((current) => current || list[0].ward_id)
    } catch (err) {
      setWardsError(err instanceof ApiError ? err.message : 'Could not load wards.')
    } finally {
      setLoadingWards(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!wardId) {
      setSubmitError('Please select a ward.')
      return
    }
    setSubmitting(true)
    try {
      await rrrCentreRepository.register({
        username,
        password,
        rrrId,
        tenderId,
        wardId,
        licenceDocRef: licenceDocRef || undefined,
      })
      const loggedIn = await login(username, password)
      if (loggedIn) {
        navigate('/', { replace: true })
      } else {
        setSubmitError('Registered successfully, but automatic login failed. Please log in manually.')
      }
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="centered-form">
      <h1>Register Your RRR Centre</h1>
      <p className="hint">
        Your account will be created immediately, but every action here requires Government approval first — you
        can log in right away to check your status.
      </p>
      <form onSubmit={handleSubmit}>
        {submitError && <InlineErrorBanner message={submitError} />}

        <label>
          RRR ID (your tender-assigned identifier)
          <input value={rrrId} onChange={(e) => setRrrId(e.target.value)} required />
        </label>
        <label>
          Tender ID
          <input value={tenderId} onChange={(e) => setTenderId(e.target.value)} required />
        </label>

        <label>
          Ward
          {loadingWards ? (
            <LoadingView message="Loading wards…" />
          ) : wardsError ? (
            <ErrorView message={wardsError} onRetry={loadWards} />
          ) : (
            <select value={wardId} onChange={(e) => setWardId(e.target.value)} required>
              {wards.map((w) => (
                <option key={w.ward_id} value={w.ward_id}>
                  {w.name} ({w.ward_id})
                </option>
              ))}
            </select>
          )}
        </label>

        <label>
          Licence document reference (optional)
          <input value={licenceDocRef} onChange={(e) => setLicenceDocRef(e.target.value)} />
        </label>
        <p className="hint">
          No real document upload in this demo — the backend only stores an opaque reference string, not a file.
        </p>

        <hr />

        <label>
          Choose a username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
        </label>
        <label>
          Choose a password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>

        <button type="submit" disabled={submitting}>
          {submitting ? 'Registering…' : 'Register'}
        </button>
      </form>
    </div>
  )
}
