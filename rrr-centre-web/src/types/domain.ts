// Mirrors the actual backend response shapes exactly (see
// backend/app/modules/*/schemas.py) — no field here is invented client-side.

export interface Ward {
  ward_id: string
  name: string
  rrr_centre_id?: string
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  role: string
  userId: string
  username: string
}

export interface RrrCentreProfile {
  user_id: string
  username: string
  rrr_id: string
  tender_id: string
  ward_id: string
  licence_doc_ref: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
}

export interface Submission {
  submission_id: string
  home_user_id: string
  ward_id: string
  status: string
  home_lat?: number | null
  home_lng?: number | null
  home_ts?: string | null
  category?: string | null
  photo_file_id?: string | null
  created_at?: string | null
}

export interface ClassifyResult {
  submission_id: string
  status: string
  category: string
}

export interface AiClassifyResult {
  submission_id: string
  status: string
  category: string | null
  predicted_category: string | null
  confidence: number | null
  model_version: string
  source: string
  needs_review: boolean
  failure_reason: string | null
}

export interface Lot {
  lot_id: string
  rrr_id: string
  ward_id: string
  category: string
  item_ids: string[]
  status: string
  bid_deadline: string | null
  total_weight_kg?: number | null
  item_details?: LotItemDetail[]
}

export interface LotItemDetail {
  submission_id: string
  home_user_id: string
  actual_weight_kg: number | null
  collection_photo_file_id: string | null
  collector_id: string | null
  collector_lat: number | null
  collector_lng: number | null
  collection_ts: string | null
}
