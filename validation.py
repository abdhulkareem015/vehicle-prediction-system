"""
validation.py
-------------
Input validation logic for the Vehicle Maintenance Prediction API.

All rules mirror the project specification exactly.  No runtime imports
from Flask are needed here so this module can be tested independently.
"""

import math

# ── Allowed categorical values ────────────────────────────────────────────────
ALLOWED_FUEL_TYPES       = {"Petrol", "Diesel"}
ALLOWED_DRIVING_CONDITIONS = {"City", "Highway", "Mixed", "Rough"}

# ── Required fields and their expected Python types ───────────────────────────
# True  → must be an integer (Days_Since_Last_Service, Previous_Repairs_Count)
# False → float/int both accepted
REQUIRED_FIELDS = {
    "Vehicle_Age_Years":       False,
    "Fuel_Type":               None,   # categorical
    "Odometer_Km":             False,
    "Average_Daily_Km":        False,
    "Days_Since_Last_Service": True,   # integer
    "Km_Since_Last_Service":   False,
    "Previous_Repairs_Count":  True,   # integer
    "Driving_Condition":       None,   # categorical
}

NUMERIC_FIELDS      = {k for k, v in REQUIRED_FIELDS.items() if v is not None}
INTEGER_FIELDS      = {k for k, v in REQUIRED_FIELDS.items() if v is True}
CATEGORICAL_FIELDS  = {k for k, v in REQUIRED_FIELDS.items() if v is None}

# Ordered lists used by the scikit-learn ColumnTransformer
NUMERIC_FEATURES = [
    "Vehicle_Age_Years",
    "Odometer_Km",
    "Average_Daily_Km",
    "Days_Since_Last_Service",
    "Km_Since_Last_Service",
    "Previous_Repairs_Count",
]

CATEGORICAL_FEATURES = [
    "Fuel_Type",
    "Driving_Condition",
]

# All model input features in the order the Pipeline expects
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def _is_real_number(value) -> bool:
    """Return True only for finite ints/floats, reject bool, inf, nan."""
    if isinstance(value, bool):
        return False
    if not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def validate_input(data: dict) -> dict:
    """
    Validate a single prediction request dictionary.

    Returns a dict with:
        "errors"  → list[str]  (empty means valid)
        "cleaned" → dict       (coerced values, present only when errors is empty)
    """
    errors = []

    # ── 1. data must be a dict ────────────────────────────────────────────────
    if not isinstance(data, dict):
        return {"errors": ["Request body must be a JSON object."], "cleaned": None}

    # ── 2. Unknown fields ─────────────────────────────────────────────────────
    unknown = set(data.keys()) - set(REQUIRED_FIELDS.keys())
    if unknown:
        errors.append(f"Unknown field(s): {sorted(unknown)}.")

    # ── 3. Missing fields ─────────────────────────────────────────────────────
    missing = set(REQUIRED_FIELDS.keys()) - set(data.keys())
    if missing:
        errors.append(f"Missing required field(s): {sorted(missing)}.")

    # Return early so later checks don't KeyError
    if errors:
        return {"errors": errors, "cleaned": None}

    cleaned = {}

    # ── 4. Categorical validation ─────────────────────────────────────────────
    fuel = data["Fuel_Type"]
    if not isinstance(fuel, str) or fuel not in ALLOWED_FUEL_TYPES:
        errors.append(
            f"Fuel_Type must be one of {sorted(ALLOWED_FUEL_TYPES)}; got {fuel!r}."
        )
    else:
        cleaned["Fuel_Type"] = fuel

    cond = data["Driving_Condition"]
    if not isinstance(cond, str) or cond not in ALLOWED_DRIVING_CONDITIONS:
        errors.append(
            f"Driving_Condition must be one of "
            f"{sorted(ALLOWED_DRIVING_CONDITIONS)}; got {cond!r}."
        )
    else:
        cleaned["Driving_Condition"] = cond

    # ── 5. Numeric validation ─────────────────────────────────────────────────
    numeric_values = {}

    for field in NUMERIC_FIELDS:
        value = data[field]

        # Reject booleans masquerading as numbers
        if isinstance(value, bool):
            errors.append(f"{field}: boolean values are not accepted as numbers.")
            continue

        # Integer-typed fields
        if field in INTEGER_FIELDS:
            if not isinstance(value, int):
                errors.append(
                    f"{field} must be an integer (whole number); got {value!r}."
                )
                continue
            if not _is_real_number(value):          # covers overflow edge-cases
                errors.append(f"{field} must be a finite number; got {value!r}.")
                continue
            numeric_values[field] = int(value)
        else:
            # Float / int both accepted
            if not _is_real_number(value):
                errors.append(
                    f"{field} must be a finite numeric value; got {value!r}."
                )
                continue
            numeric_values[field] = float(value)

    # ── 6. Business-rule validation (only when all numerics parsed OK) ────────
    if not errors:
        age     = numeric_values["Vehicle_Age_Years"]
        odo     = numeric_values["Odometer_Km"]
        daily   = numeric_values["Average_Daily_Km"]
        days    = numeric_values["Days_Since_Last_Service"]
        km_svc  = numeric_values["Km_Since_Last_Service"]
        repairs = numeric_values["Previous_Repairs_Count"]

        # Vehicle age > 0
        if age <= 0:
            errors.append("Vehicle_Age_Years must be greater than zero.")

        # Non-negative distances and times
        if odo < 0:
            errors.append("Odometer_Km must be non-negative.")
        if daily < 0:
            errors.append("Average_Daily_Km must be non-negative.")
        if days < 0:
            errors.append("Days_Since_Last_Service must be non-negative.")
        if km_svc < 0:
            errors.append("Km_Since_Last_Service must be non-negative.")
        if repairs < 0:
            errors.append("Previous_Repairs_Count must be non-negative.")

        # Km since last service cannot exceed total odometer
        if km_svc > odo:
            errors.append(
                "Km_Since_Last_Service cannot exceed Odometer_Km."
            )

        # Days since last service cannot exceed total vehicle life in days
        vehicle_age_days = age * 365
        if days > vehicle_age_days:
            errors.append(
                f"Days_Since_Last_Service ({days}) cannot exceed the vehicle age "
                f"in days ({vehicle_age_days:.1f})."
            )

        if not errors:
            cleaned.update(numeric_values)

    return {"errors": errors, "cleaned": cleaned if not errors else None}
