from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PricePredictionRequest(BaseModel):
    product_type: str = Field(min_length=1, max_length=100)
    condition: str = Field(min_length=1, max_length=50)
    quantity: int = Field(gt=0, le=1_000_000)
    total_weight_kg: float = Field(gt=0, le=1_000_000, allow_inf_nan=False)
    location: str = Field(min_length=1, max_length=200)


class PricePredictionResponse(BaseModel):
    predicted_price: float


class PriceEstimateRequest(BaseModel):
    product_type: str = Field(min_length=1, max_length=100)
    condition: str = Field(min_length=1, max_length=50)
    total_weight_kg: float = Field(gt=0, le=1_000_000, allow_inf_nan=False)
    location: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, gt=0, le=1_000_000)


class PriceEstimate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    predicted_price_per_kg: float
    min_price: float
    max_price: float
    estimated_total_value: float
    trend: str | None = None
    product_type: str
    condition: str
    weight_kg: float
    is_estimate: bool = True
    model_version: str | None = None
    estimated_at: datetime


class PriceEstimateResponse(PriceEstimate):
    pass
