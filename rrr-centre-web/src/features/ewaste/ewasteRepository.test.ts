import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../../api/apiClient'
import { EwasteRepository } from './ewasteRepository'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('EwasteRepository.receive', () => {
  it('posts to the correct path with Authorization and Idempotency-Key', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      expect(url).toContain('/api/v1/ewaste/submissions/sub-1/receive')
      const headers = init.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer tok-1')
      expect(headers['Idempotency-Key']).toBe('idem-1')
      return Promise.resolve(jsonResponse({ submission_id: 'sub-1', status: 'AT_RRR' }))
    })
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const result = await repo.receive('sub-1', 'tok-1', 'idem-1')
    expect(result.status).toBe('AT_RRR')
  })

  it('propagates RRR_OUTSIDE_ASSIGNED_WARD as a structured error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: false, error_code: 'RRR_OUTSIDE_ASSIGNED_WARD', message: 'Outside ward.' }, 403),
      )
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    await expect(repo.receive('sub-1', 'tok-1', 'idem-1')).rejects.toMatchObject({
      errorCode: 'RRR_OUTSIDE_ASSIGNED_WARD',
    })
  })
})

describe('EwasteRepository.classify', () => {
  it('sends the category in the request body', async () => {
    let capturedBody: unknown
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return Promise.resolve(jsonResponse({ submission_id: 'sub-1', status: 'CLASSIFIED', category: 'metal-scrap' }))
    })
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const result = await repo.classify('sub-1', 'metal-scrap', 'tok-1', 'idem-1')
    expect(capturedBody).toEqual({ category: 'metal-scrap' })
    expect(result.category).toBe('metal-scrap')
  })
})

describe('EwasteRepository.classifyWithAi', () => {
  it('posts to the AI classify path with Idempotency-Key and no request body fields beyond the submission id in the URL', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      expect(url).toContain('/api/v1/ai/classify/sub-1')
      const headers = init.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer tok-1')
      expect(headers['Idempotency-Key']).toBe('idem-ai-1')
      return Promise.resolve(
        jsonResponse({
          submission_id: 'sub-1', status: 'CLASSIFIED', category: 'metal-scrap', predicted_category: 'metal-scrap',
          confidence: 0.81, model_version: 'ewaste-classifier-v1', source: 'AI', needs_review: false, failure_reason: null,
        }),
      )
    })
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const result = await repo.classifyWithAi('sub-1', 'tok-1', 'idem-ai-1')
    expect(result.status).toBe('CLASSIFIED')
    expect(result.needs_review).toBe(false)
    expect(result.confidence).toBeCloseTo(0.81)
  })

  it('surfaces a needs_review result without throwing (low confidence is not an error)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        submission_id: 'sub-1', status: 'NEEDS_REVIEW', category: null, predicted_category: 'plastics',
        confidence: 0.2, model_version: 'ewaste-classifier-v1', source: 'AI', needs_review: true, failure_reason: null,
      }),
    )
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const result = await repo.classifyWithAi('sub-1', 'tok-1', 'idem-ai-2')
    expect(result.needs_review).toBe(true)
    expect(result.category).toBeNull()
  })

  it('never receives any credential/secret field on the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        submission_id: 'sub-1', status: 'CLASSIFIED', category: 'metal-scrap', predicted_category: 'metal-scrap',
        confidence: 0.9, model_version: 'ewaste-classifier-v1', source: 'AI', needs_review: false, failure_reason: null,
      }),
    )
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))
    const result = await repo.classifyWithAi('sub-1', 'tok-1', 'idem-ai-3')
    expect(Object.keys(result)).not.toContain('api_key')
    expect(Object.keys(result)).not.toContain('credentials')
  })
})

describe('EwasteRepository queue listings', () => {
  it('listAwaitingReceipt requests the correct path', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain('/api/v1/ewaste/submissions/awaiting-receipt')
      return Promise.resolve(jsonResponse({ success: true, submissions: [] }))
    })
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))
    expect(await repo.listAwaitingReceipt('tok-1')).toEqual([])
  })

  it('listAwaitingClassification requests the correct path', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain('/api/v1/ewaste/submissions/awaiting-classification')
      return Promise.resolve(jsonResponse({ success: true, submissions: [] }))
    })
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))
    expect(await repo.listAwaitingClassification('tok-1')).toEqual([])
  })

  it('listClassified requests the correct path', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain('/api/v1/ewaste/submissions/classified')
      return Promise.resolve(jsonResponse({ success: true, submissions: [] }))
    })
    const repo = new EwasteRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))
    expect(await repo.listClassified('tok-1')).toEqual([])
  })
})
