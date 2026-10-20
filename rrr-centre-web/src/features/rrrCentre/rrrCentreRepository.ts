import { ApiClient, apiClient as defaultApiClient } from '../../api/apiClient'
import type { RrrCentreProfile } from '../../types/domain'

export interface RegisterInput {
  username: string
  password: string
  rrrId: string
  tenderId: string
  wardId: string
  licenceDocRef?: string
}

export class RrrCentreRepository {
  private readonly client: ApiClient
  constructor(client: ApiClient = defaultApiClient) {
    this.client = client
  }

  /** Public endpoint — self-registration, pending admin approval. */
  async register(input: RegisterInput): Promise<RrrCentreProfile> {
    return this.client.post<RrrCentreProfile>('/api/v1/rrr-centres/register', {
      username: input.username,
      password: input.password,
      rrr_id: input.rrrId,
      tender_id: input.tenderId,
      ward_id: input.wardId,
      licence_doc_ref: input.licenceDocRef || undefined,
    })
  }

  async getProfile(accessToken: string): Promise<RrrCentreProfile> {
    return this.client.get<RrrCentreProfile>('/api/v1/rrr-centres/me', accessToken)
  }
}

export const rrrCentreRepository = new RrrCentreRepository()
