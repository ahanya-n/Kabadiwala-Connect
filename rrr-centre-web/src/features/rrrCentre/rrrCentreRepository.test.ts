import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../../api/apiClient'
import { RrrCentreRepository } from './rrrCentreRepository'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('RrrCentreRepository.register', () => {
  it('sends the exact registration request body the backend expects', async () => {
    let capturedBody: unknown
    const fetchImpl = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      expect(url).toContain('/api/v1/rrr-centres/register')
      capturedBody = JSON.parse(init.body as string)
      return Promise.resolve(
        jsonResponse({
          user_id: 'rrr-1', username: 'rrr-centre-1', rrr_id: 'RRR-001', tender_id: 'TENDER-001',
          ward_id: 'WARD-1', licence_doc_ref: null, status: 'PENDING',
        }),
      )
    })
    const repo = new RrrCentreRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const profile = await repo.register({
      username: 'rrr-centre-1', password: 'rrrpass123', rrrId: 'RRR-001', tenderId: 'TENDER-001', wardId: 'WARD-1',
    })

    expect(capturedBody).toMatchObject({ rrr_id: 'RRR-001', tender_id: 'TENDER-001', ward_id: 'WARD-1' })
    expect((capturedBody as Record<string, unknown>).licence_doc_ref).toBeUndefined()
    expect(profile.status).toBe('PENDING')
  })

  it('propagates WARD_NOT_FOUND as a structured error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, error_code: 'WARD_NOT_FOUND', message: 'No ward.' }, 404))
    const repo = new RrrCentreRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    await expect(
      repo.register({ username: 'x', password: 'x', rrrId: 'x', tenderId: 'x', wardId: 'NOPE' }),
    ).rejects.toMatchObject({ errorCode: 'WARD_NOT_FOUND' })
  })
})

describe('RrrCentreRepository.getProfile', () => {
  it('attaches the bearer token', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer tok-1')
      return Promise.resolve(
        jsonResponse({
          user_id: 'rrr-1', username: 'rrr-centre-1', rrr_id: 'RRR-001', tender_id: 'TENDER-001',
          ward_id: 'WARD-1', licence_doc_ref: null, status: 'APPROVED',
        }),
      )
    })
    const repo = new RrrCentreRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const profile = await repo.getProfile('tok-1')
    expect(profile.status).toBe('APPROVED')
  })
})
