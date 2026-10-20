import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../../api/apiClient'
import { LotsRepository } from './lotsRepository'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('LotsRepository.createLot', () => {
  it('sends the exact request shape the backend expects, with Idempotency-Key', async () => {
    let capturedBody: unknown
    const fetchImpl = vi.fn().mockImplementation((url: string, init: RequestInit) => {
      expect(url).toContain('/api/v1/lots')
      const headers = init.headers as Record<string, string>
      expect(headers['Idempotency-Key']).toBe('idem-1')
      capturedBody = JSON.parse(init.body as string)
      return Promise.resolve(
        jsonResponse({
          lot_id: 'lot-1', rrr_id: 'RRR-001', ward_id: 'WARD-1', category: 'metal-scrap',
          item_ids: ['sub-1'], status: 'DRAFT', bid_deadline: null,
        }),
      )
    })
    const repo = new LotsRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const lot = await repo.createLot('metal-scrap', ['sub-1'], 'tok-1', 'idem-1')
    expect(capturedBody).toEqual({ category: 'metal-scrap', submission_ids: ['sub-1'] })
    expect(lot.status).toBe('DRAFT')
  })

  it('propagates SUBMISSION_CATEGORY_MISMATCH as a structured error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: false, error_code: 'SUBMISSION_CATEGORY_MISMATCH', message: 'Mismatch.' }, 400),
      )
    const repo = new LotsRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    await expect(repo.createLot('x', ['sub-1'], 'tok-1', 'idem-1')).rejects.toMatchObject({
      errorCode: 'SUBMISSION_CATEGORY_MISMATCH',
    })
  })
})

describe('LotsRepository.publishLot', () => {
  it('posts to the publish path and returns the updated lot', async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain('/api/v1/lots/lot-1/publish')
      return Promise.resolve(
        jsonResponse({
          lot_id: 'lot-1', rrr_id: 'RRR-001', ward_id: 'WARD-1', category: 'metal-scrap',
          item_ids: ['sub-1'], status: 'LISTED_FOR_BIDDING', bid_deadline: '2026-09-21T00:00:00Z',
        }),
      )
    })
    const repo = new LotsRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const lot = await repo.publishLot('lot-1', 'tok-1', 'idem-1')
    expect(lot.status).toBe('LISTED_FOR_BIDDING')
    expect(lot.bid_deadline).not.toBeNull()
  })
})

describe('LotsRepository.listMyLots / getLot', () => {
  it('listMyLots parses the lots list', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true, lots: [] }))
    const repo = new LotsRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))
    expect(await repo.listMyLots('tok-1')).toEqual([])
  })

  it('getLot propagates NOT_LOT_OWNER as a structured error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, error_code: 'NOT_LOT_OWNER', message: 'No access.' }, 403))
    const repo = new LotsRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    await expect(repo.getLot('lot-1', 'tok-1')).rejects.toMatchObject({ errorCode: 'NOT_LOT_OWNER' })
  })
})
