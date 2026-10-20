import { ApiClient, apiClient as defaultApiClient } from '../../api/apiClient'
import type { AiClassifyResult, ClassifyResult, Submission } from '../../types/domain'

export class EwasteRepository {
  private readonly client: ApiClient
  constructor(client: ApiClient = defaultApiClient) {
    this.client = client
  }

  async listAwaitingReceipt(accessToken: string): Promise<Submission[]> {
    const json = await this.client.get<{ submissions: Submission[] }>(
      '/api/v1/ewaste/submissions/awaiting-receipt',
      accessToken,
    )
    return json.submissions ?? []
  }

  async receive(submissionId: string, accessToken: string, idempotencyKey: string): Promise<{ submission_id: string; status: string }> {
    return this.client.post(
      `/api/v1/ewaste/submissions/${submissionId}/receive`,
      undefined,
      accessToken,
      idempotencyKey,
    )
  }

  async listAwaitingClassification(accessToken: string): Promise<Submission[]> {
    const json = await this.client.get<{ submissions: Submission[] }>(
      '/api/v1/ewaste/submissions/awaiting-classification',
      accessToken,
    )
    return json.submissions ?? []
  }

  async classify(
    submissionId: string,
    category: string,
    accessToken: string,
    idempotencyKey: string,
  ): Promise<ClassifyResult> {
    return this.client.post(
      `/api/v1/ewaste/submissions/${submissionId}/classify`,
      { category },
      accessToken,
      idempotencyKey,
    )
  }

  /** Phase 8: AI classification attempt. Never sends or receives any
   * provider credential — the request carries only the submission id. */
  async classifyWithAi(submissionId: string, accessToken: string, idempotencyKey: string): Promise<AiClassifyResult> {
    return this.client.post(
      `/api/v1/ai/classify/${submissionId}`,
      undefined,
      accessToken,
      idempotencyKey,
    )
  }

  async listClassified(accessToken: string): Promise<Submission[]> {
    const json = await this.client.get<{ submissions: Submission[] }>(
      '/api/v1/ewaste/submissions/classified',
      accessToken,
    )
    return json.submissions ?? []
  }
}

export const ewasteRepository = new EwasteRepository()
