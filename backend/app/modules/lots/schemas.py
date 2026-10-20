from datetime import datetime

from pydantic import BaseModel


class LotCreateRequest(BaseModel):
    category: str
    submission_ids: list[str]


class LotResponse(BaseModel):
    lot_id: str
    rrr_id: str
    ward_id: str
    category: str
    item_ids: list[str]
    status: str
    bid_deadline: datetime | None = None
    total_weight_kg: float | None = None
    item_details: list[dict] = []
