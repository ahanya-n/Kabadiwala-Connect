
from pathlib import Path

import joblib
import pandas as pd


MODEL_PATH = (
    Path(__file__).resolve().parent
    / "models"
    / "collector_price_model.joblib"
)

model = joblib.load(MODEL_PATH)


def predict_collector_price(
    product_type: str,
    condition: str,
    quantity: int,
    total_weight_kg: float,
    location: str,
) -> float:
    data = pd.DataFrame(
        [
            {
                "product_type": product_type,
                "condition": condition,
                "quantity": quantity,
                "total_weight_kg": total_weight_kg,
                "location": location,
            }
        ]
    )

    prediction = model.predict(data)

    return round(float(prediction[0]), 2)