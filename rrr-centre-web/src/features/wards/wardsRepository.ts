import { ApiClient, apiClient as defaultApiClient } from '../../api/apiClient'
import type { Ward } from '../../types/domain'

export class WardsRepository {
  private readonly client: ApiClient
  constructor(client: ApiClient = defaultApiClient) {
    this.client = client
  }

  /** Public endpoint — no token needed (registration happens before login). */
  async listWards(): Promise<Ward[]> {
    const json = await this.client.get<{ wards: Ward[] }>('/api/v1/wards')
    return json.wards ?? []
  }
}

export const wardsRepository = new WardsRepository()
