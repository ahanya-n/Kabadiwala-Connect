import { ApiClient, apiClient as defaultApiClient } from '../../api/apiClient'
import type { Lot } from '../../types/domain'

export class LotsRepository {
  private readonly client: ApiClient
  constructor(client: ApiClient = defaultApiClient) {
    this.client = client
  }

  async createLot(
    category: string,
    submissionIds: string[],
    accessToken: string,
    idempotencyKey: string,
  ): Promise<Lot> {
    return this.client.post(
      '/api/v1/lots',
      { category, submission_ids: submissionIds },
      accessToken,
      idempotencyKey,
    )
  }

  async listMyLots(accessToken: string): Promise<Lot[]> {
    const json = await this.client.get<{ lots: Lot[] }>('/api/v1/lots', accessToken)
    return json.lots ?? []
  }

  async getLot(lotId: string, accessToken: string): Promise<Lot> {
    return this.client.get<Lot>(`/api/v1/lots/${lotId}`, accessToken)
  }

  async publishLot(lotId: string, accessToken: string, idempotencyKey: string): Promise<Lot> {
    return this.client.post(`/api/v1/lots/${lotId}/publish`, undefined, accessToken, idempotencyKey)
  }
}

export const lotsRepository = new LotsRepository()
