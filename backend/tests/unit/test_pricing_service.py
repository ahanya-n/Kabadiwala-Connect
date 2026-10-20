import pytest

from ai.pricing import price_predictor
from app.core.errors import AppError
from app.modules.pricing import service


def test_predict_price_forwards_model_features_and_returns_prediction(monkeypatch):
    received = {}

    def fake_predict_collector_price(**features):
        received.update(features)
        return 371.72

    monkeypatch.setattr(price_predictor, "predict_collector_price", fake_predict_collector_price)

    result = service.predict_price(
        product_type=" metal-scrap ",
        condition=" good ",
        quantity=2,
        total_weight_kg=5.0,
        location=" Bengaluru ",
    )

    assert result == 371.72
    assert received == {
        "product_type": "metal-scrap",
        "condition": "good",
        "quantity": 2,
        "total_weight_kg": 5.0,
        "location": "Bengaluru",
    }


@pytest.mark.parametrize(
    ("field", "value", "error_code"),
    [
        ("product_type", " ", "PRODUCT_TYPE_REQUIRED"),
        ("condition", " ", "CONDITION_REQUIRED"),
        ("location", " ", "LOCATION_REQUIRED"),
        ("quantity", 0, "INVALID_QUANTITY"),
        ("total_weight_kg", 0, "INVALID_TOTAL_WEIGHT"),
    ],
)
def test_predict_price_rejects_invalid_values(field, value, error_code):
    features = {
        "product_type": "metal-scrap",
        "condition": "good",
        "quantity": 1,
        "total_weight_kg": 1.0,
        "location": "Bengaluru",
    }
    features[field] = value

    with pytest.raises(AppError) as error:
        service.predict_price(**features)

    assert error.value.error_code == error_code
