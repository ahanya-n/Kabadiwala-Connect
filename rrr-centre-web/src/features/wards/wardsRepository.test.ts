import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../../api/apiClient'
import { WardsRepository } from './wardsRepository'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('WardsRepository.listWards', () => {
  it('parses the ward list without requiring a token', async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      expect(headers.Authorization).toBeUndefined()
      return Promise.resolve(
        jsonResponse({
          success: true,
          wards: [
            { ward_id: 'WARD-1', name: 'Ward One' },
            { ward_id: 'WARD-2', name: 'Ward Two' },
          ],
        }),
      )
    })
    const repo = new WardsRepository(new ApiClient({ baseUrl: 'http://test', fetchImpl }))

    const wards = await repo.listWards()
    expect(wards).toHaveLength(2)
    expect(wards[0].ward_id).toBe('WARD-1')
  })
})
