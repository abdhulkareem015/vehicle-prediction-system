"""
generate_dataset.py
-------------------
Generates vehicle_maintenance_synthetic.csv for development/testing.

This is a SYNTHETIC dataset created programmatically.  It does NOT represent
real vehicle histories.  It is provided so you can run training immediately
without needing an external data source.

Replace this file with your own dataset before submitting the project.

Run:
    python generate_dataset.py
"""

import os
import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
N   = 2000

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
OUT_PATH  = os.path.join(BASE_DIR, "data", "vehicle_maintenance_synthetic.csv")


def generate() -> pd.DataFrame:
    vehicle_ids    = [f"VH{str(i).zfill(5)}" for i in range(1, N + 1)]
    age_years      = RNG.uniform(0.5, 15.0, N).round(1)
    fuel_types     = RNG.choice(["Petrol", "Diesel"], N, p=[0.55, 0.45])
    odometer       = (age_years * RNG.uniform(8000, 20000, N)).round(0).astype(int)
    daily_km       = RNG.uniform(5, 150, N).round(1)
    days_since_svc = RNG.integers(0, (age_years * 365).astype(int).clip(1), N)
    km_since_svc   = np.minimum(
        (days_since_svc * daily_km * RNG.uniform(0.7, 1.1, N)).round(0).astype(int),
        odometer,
    )
    repairs        = RNG.integers(0, 12, N)
    driving_conds  = RNG.choice(["City", "Highway", "Mixed", "Rough"], N,
                                 p=[0.35, 0.25, 0.30, 0.10])

    # ── Synthetic target rule (not a real-world model) ─────────────────────
    # Higher probability of needing maintenance when:
    #   - long time since last service
    #   - high km since last service
    #   - many previous repairs
    #   - rough driving condition
    score = (
        (days_since_svc / 365) * 0.4
        + (km_since_svc / 10000) * 0.3
        + (repairs / 10) * 0.2
        + (driving_conds == "Rough").astype(float) * 0.1
    )
    noise = RNG.normal(0, 0.15, N)
    prob  = 1 / (1 + np.exp(-(score + noise - 0.5) * 3))
    target = (prob > 0.5).astype(int)

    df = pd.DataFrame({
        "Vehicle_ID":                vehicle_ids,
        "Vehicle_Age_Years":         age_years,
        "Fuel_Type":                 fuel_types,
        "Odometer_Km":               odometer,
        "Average_Daily_Km":          daily_km,
        "Days_Since_Last_Service":   days_since_svc,
        "Km_Since_Last_Service":     km_since_svc,
        "Previous_Repairs_Count":    repairs,
        "Driving_Condition":         driving_conds,
        "Maintenance_Needed_30_Days": target,
    })

    return df


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    df = generate()
    df.to_csv(OUT_PATH, index=False)
    print(f"Saved {len(df)} rows to {OUT_PATH}")
    print(df["Maintenance_Needed_30_Days"].value_counts().to_string())
