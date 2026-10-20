from fastapi import APIRouter, Depends

from app.core.rbac import require_role
from app.modules.pricing import service
from app.modules.pricing.schemas import (
    PriceEstimateRequest,
    PriceEstimateResponse,
    PricePredictionRequest,
    PricePredictionResponse,
)


router = APIRouter(prefix="/api/v1/pricing", tags=["pricing"])


@router.post("/predict", response_model=PricePredictionResponse)
async def predict_price_route(
    body: PricePredictionRequest,
    _current_user: dict = Depends(require_role("RRR_CENTER")),
):
    predicted_price = service.predict_price(
        product_type=body.product_type,
        condition=body.condition,
        quantity=body.quantity,
        total_weight_kg=body.total_weight_kg,
        location=body.location,
    )
    return PricePredictionResponse(predicted_price=predicted_price)


@router.post("/estimate", response_model=PriceEstimateResponse)
async def estimate_price_route(
    body: PriceEstimateRequest,
    current_user: dict = Depends(require_role("HOME_USER")),
):
    del current_user
    estimate = service.estimate_price(
        product_type=body.product_type,
        condition=body.condition,
        quantity=body.quantity,
        total_weight_kg=body.total_weight_kg,
        location=body.location,
    )
    return PriceEstimateResponse(**estimate)
