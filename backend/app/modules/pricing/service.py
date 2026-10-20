from datetime import datetime, timezone

from app.core.config import settings
from app.core.errors import bad_request


def predict_price(
    *,
    product_type: str,
    condition: str,
    quantity: int,
    total_weight_kg: float,
    location: str,
) -> float:
    normalized_product_type = product_type.strip()
    normalized_condition = condition.strip()
    normalized_location = location.strip()

    if not normalized_product_type:
        raise bad_request("PRODUCT_TYPE_REQUIRED", "Product type is required.")
    if not normalized_condition:
        raise bad_request("CONDITION_REQUIRED", "Condition is required.")
    if not normalized_location:
        raise bad_request("LOCATION_REQUIRED", "Location is required.")
    if quantity <= 0:
        raise bad_request("INVALID_QUANTITY", "Quantity must be greater than zero.")
    if total_weight_kg <= 0:
        raise bad_request("INVALID_TOTAL_WEIGHT", "Total weight must be greater than zero.")

    # Load the model only when pricing is requested, not during API startup.
    from ai.pricing.price_predictor import predict_collector_price

    return predict_collector_price(
        product_type=normalized_product_type,
        condition=normalized_condition,
        quantity=quantity,
        total_weight_kg=total_weight_kg,
        location=normalized_location,
    )


def estimate_price(
    *,
    product_type: str,
    condition: str,
    quantity: int,
    total_weight_kg: float,
    location: str,
) -> dict:
    """Build a user estimate from the existing single-value price model.

    The model currently exposes no uncertainty interval or market trend. The
    configured percentage band is therefore an explicit estimate range around
    the model output, not a fabricated market-price series.
    """
    predicted_price_per_kg = predict_price(
        product_type=product_type,
        condition=condition,
        quantity=quantity,
        total_weight_kg=total_weight_kg,
        location=location,
    )
    band = settings.pricing_estimate_range_percent
    min_price = round(predicted_price_per_kg * (1 - band), 2)
    max_price = round(predicted_price_per_kg * (1 + band), 2)
    return {
        "predicted_price_per_kg": predicted_price_per_kg,
        "min_price": min_price,
        "max_price": max_price,
        "estimated_total_value": round(predicted_price_per_kg * total_weight_kg, 2),
        "trend": None,
        "product_type": product_type.strip(),
        "condition": condition.strip(),
        "weight_kg": total_weight_kg,
        "is_estimate": True,
        "model_version": settings.pricing_model_version,
        "estimated_at": datetime.now(timezone.utc),
    }
