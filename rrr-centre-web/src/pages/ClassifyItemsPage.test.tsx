import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../api/apiClient'
import { LoadingView } from '../components/StateViews'
import { AuthProvider, useAuth } from '../features/auth/AuthContext'
import { AuthRepository } from '../features/auth/authRepository'

// ewasteRepository is a module-level singleton built on the real default
// ApiClient (unlike AuthRepository, which ClassifyItemsPage's AuthProvider
// supports injecting) — without mocking it here, the page would call the
// REAL backend on 127.0.0.1:8000 during this test, since Node's global
// fetch is available in the jsdom test environment. vi.mock is the
// standard, non-invasive way to intercept a singleton import without
// changing the page's production code.
vi.mock('../features/ewaste/ewasteRepository', () => ({
  ewasteRepository: {
    listAwaitingClassification: vi.fn(),
    classify: vi.fn(),
    classifyWithAi: vi.fn(),
    listAwaitingReceipt: vi.fn(),
    listClassified: vi.fn(),
  },
}))

const { ewasteRepository } = await import('../features/ewaste/ewasteRepository')
const { ClassifyItemsPage } = await import('./ClassifyItemsPage')

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const STORED_SESSION = {
  accessToken: 'acc-1',
  refreshToken: 'ref-1',
  role: 'RRR_CENTER',
  userId: 'rrr-1',
  username: 'rrr-centre-1',
}

const ONE_SUBMISSION = [{ submission_id: 'sub-12345678', ward_id: 'WARD-1', status: 'AT_RRR', home_user_id: 'hu-1' }]

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('kc_rrr_auth_session', JSON.stringify(STORED_SESSION))
  vi.mocked(ewasteRepository.listAwaitingClassification).mockReset().mockResolvedValue(ONE_SUBMISSION as never)
  vi.mocked(ewasteRepository.classifyWithAi).mockReset()
})

// Mirrors App.tsx's own RequireAuth gate: ClassifyItemsPage (like every
// protected page in this app) assumes a session already exists by the
// time it mounts — in the real app, App.tsx's RequireAuth guarantees
// this by not rendering the page at all until status is 'authenticated'.
// This test replicates that same gate rather than changing the page.
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status !== 'authenticated') return <LoadingView />
  return <>{children}</>
}

function renderPage() {
  const authFetch = vi
    .fn()
    .mockResolvedValue(jsonResponse({ user_id: 'rrr-1', username: 'rrr-centre-1', role: 'RRR_CENTER' }))
  const repository = new AuthRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl: authFetch }))
  return render(
    <MemoryRouter>
      <AuthProvider repository={repository}>
        <RequireAuth>
          <ClassifyItemsPage />
        </RequireAuth>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ClassifyItemsPage — AI classification', () => {
  it('shows the high-confidence success result: category, confidence, and AI source', async () => {
    vi.mocked(ewasteRepository.classifyWithAi).mockResolvedValue({
      submission_id: 'sub-12345678', status: 'CLASSIFIED', category: 'metal-scrap', predicted_category: 'metal-scrap',
      confidence: 0.81, model_version: 'ewaste-classifier-v1', source: 'AI', needs_review: false, failure_reason: null,
    })
    renderPage()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByRole('button', { name: /ai classify/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /ai classify/i }))

    await waitFor(() => {
      expect(screen.getByText(/metal-scrap/)).toBeInTheDocument()
      expect(screen.getByText(/81\.0%/)).toBeInTheDocument()
      expect(screen.getByText(/AI \(ewaste-classifier-v1\)/)).toBeInTheDocument()
      expect(screen.getByText(/now CLASSIFIED/i)).toBeInTheDocument()
    })
    expect(ewasteRepository.classifyWithAi).toHaveBeenCalledWith('sub-12345678', 'acc-1', expect.any(String))
  })

  it('shows the low-confidence result as needing manual review, not a fabricated success', async () => {
    vi.mocked(ewasteRepository.classifyWithAi).mockResolvedValue({
      submission_id: 'sub-12345678', status: 'NEEDS_REVIEW', category: null, predicted_category: 'plastics',
      confidence: 0.24, model_version: 'ewaste-classifier-v1', source: 'AI', needs_review: true, failure_reason: null,
    })
    renderPage()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByRole('button', { name: /ai classify/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /ai classify/i }))

    await waitFor(() => {
      expect(screen.getByText(/plastics/)).toBeInTheDocument()
      expect(screen.getByText(/manual review required/i)).toBeInTheDocument()
    })
    // The manual category form must still be present and usable.
    expect(screen.getByLabelText(/category \(manual\)/i)).toBeInTheDocument()
  })

  it('shows a failed AI attempt as a clear fallback, never as a fabricated success', async () => {
    vi.mocked(ewasteRepository.classifyWithAi).mockResolvedValue({
      submission_id: 'sub-12345678', status: 'NEEDS_REVIEW', category: null, predicted_category: null,
      confidence: null, model_version: 'ewaste-classifier-v1', source: 'AI', needs_review: true,
      failure_reason: 'simulated provider outage',
    })
    renderPage()

    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByRole('button', { name: /ai classify/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /ai classify/i }))

    await waitFor(() => {
      expect(screen.getByText(/attempt failed/i)).toBeInTheDocument()
      expect(screen.getByText(/simulated provider outage/)).toBeInTheDocument()
    })
  })
})
