"""
tests/test_validation.py
------------------------
Unit tests for validation.py.

Run with:
    python -m pytest tests/ -v
"""

import pytest
import sys
import os

# Make the project root importable regardless of working directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from validation import validate_input

# ── Shared valid payload ───────────────────────────────────────────────────────
VALID_PAYLOAD = {
    "Vehicle_Age_Years":       6,
    "Fuel_Type":               "Diesel",
    "Odometer_Km":             90000,
    "Average_Daily_Km":        45,
    "Days_Since_Last_Service": 210,
    "Km_Since_Last_Service":   9500,
    "Previous_Repairs_Count":  3,
    "Driving_Condition":       "City",
}


def _copy(**overrides):
    """Return a copy of VALID_PAYLOAD with selected fields overridden."""
    d = VALID_PAYLOAD.copy()
    d.update(overrides)
    return d


def _remove(field):
    """Return VALID_PAYLOAD without the named field."""
    d = VALID_PAYLOAD.copy()
    d.pop(field)
    return d


# ── Valid input ────────────────────────────────────────────────────────────────

class TestValidInput:

    def test_valid_payload_passes(self):
        result = validate_input(VALID_PAYLOAD)
        assert result["errors"] == []
        assert result["cleaned"] is not None

    def test_cleaned_values_are_correct_types(self):
        result = validate_input(VALID_PAYLOAD)
        cleaned = result["cleaned"]
        assert isinstance(cleaned["Days_Since_Last_Service"], int)
        assert isinstance(cleaned["Previous_Repairs_Count"], int)
        assert isinstance(cleaned["Fuel_Type"], str)

    def test_petrol_is_accepted(self):
        result = validate_input(_copy(Fuel_Type="Petrol"))
        assert result["errors"] == []

    def test_all_driving_conditions_accepted(self):
        for cond in ("City", "Highway", "Mixed", "Rough"):
            result = validate_input(_copy(Driving_Condition=cond))
            assert result["errors"] == [], f"Failed for Driving_Condition={cond}"

    def test_zero_odometer_and_daily_km_accepted(self):
        result = validate_input(_copy(
            Odometer_Km=0,
            Average_Daily_Km=0,
            Days_Since_Last_Service=0,
            Km_Since_Last_Service=0,
        ))
        assert result["errors"] == []

    def test_float_vehicle_age_accepted(self):
        result = validate_input(_copy(Vehicle_Age_Years=3.5))
        assert result["errors"] == []


# ── Missing fields ─────────────────────────────────────────────────────────────

class TestMissingFields:

    def test_missing_single_field(self):
        result = validate_input(_remove("Fuel_Type"))
        assert any("Missing" in e for e in result["errors"])

    def test_missing_multiple_fields(self):
        d = {"Vehicle_Age_Years": 5}
        result = validate_input(d)
        assert any("Missing" in e for e in result["errors"])

    def test_empty_dict_reports_all_missing(self):
        result = validate_input({})
        assert any("Missing" in e for e in result["errors"])


# ── Unknown fields ─────────────────────────────────────────────────────────────

class TestUnknownFields:

    def test_extra_field_is_rejected(self):
        d = _copy()
        d["Colour"] = "Red"
        result = validate_input(d)
        assert any("Unknown" in e for e in result["errors"])


# ── Categorical validation ─────────────────────────────────────────────────────

class TestCategoricalValidation:

    def test_invalid_fuel_type(self):
        result = validate_input(_copy(Fuel_Type="Electric"))
        assert any("Fuel_Type" in e for e in result["errors"])

    def test_lowercase_fuel_type_rejected(self):
        result = validate_input(_copy(Fuel_Type="diesel"))
        assert any("Fuel_Type" in e for e in result["errors"])

    def test_invalid_driving_condition(self):
        result = validate_input(_copy(Driving_Condition="Urban"))
        assert any("Driving_Condition" in e for e in result["errors"])

    def test_numeric_fuel_type_rejected(self):
        result = validate_input(_copy(Fuel_Type=1))
        assert any("Fuel_Type" in e for e in result["errors"])


# ── Numeric / type validation ──────────────────────────────────────────────────

class TestNumericValidation:

    def test_boolean_rejected_as_number(self):
        result = validate_input(_copy(Vehicle_Age_Years=True))
        assert result["errors"]

    def test_nan_rejected(self):
        import math
        result = validate_input(_copy(Odometer_Km=float("nan")))
        assert result["errors"]

    def test_inf_rejected(self):
        result = validate_input(_copy(Odometer_Km=float("inf")))
        assert result["errors"]

    def test_string_in_numeric_field(self):
        result = validate_input(_copy(Odometer_Km="ninety thousand"))
        assert result["errors"]

    def test_float_rejected_for_integer_field(self):
        result = validate_input(_copy(Days_Since_Last_Service=210.5))
        assert any("Days_Since_Last_Service" in e for e in result["errors"])

    def test_float_rejected_for_repairs_count(self):
        result = validate_input(_copy(Previous_Repairs_Count=2.9))
        assert any("Previous_Repairs_Count" in e for e in result["errors"])


# ── Business-rule validation ───────────────────────────────────────────────────

class TestBusinessRules:

    def test_vehicle_age_zero_rejected(self):
        result = validate_input(_copy(Vehicle_Age_Years=0))
        assert any("Vehicle_Age_Years" in e for e in result["errors"])

    def test_negative_vehicle_age_rejected(self):
        result = validate_input(_copy(Vehicle_Age_Years=-1))
        assert any("Vehicle_Age_Years" in e for e in result["errors"])

    def test_negative_odometer_rejected(self):
        result = validate_input(_copy(Odometer_Km=-100))
        assert any("Odometer_Km" in e for e in result["errors"])

    def test_km_since_service_exceeds_odometer(self):
        result = validate_input(_copy(Km_Since_Last_Service=91000, Odometer_Km=90000))
        assert any("Km_Since_Last_Service" in e for e in result["errors"])

    def test_days_exceeds_vehicle_age_in_days(self):
        # 2 years = 730 days; 800 days > 730
        result = validate_input(_copy(
            Vehicle_Age_Years=2,
            Days_Since_Last_Service=800,
        ))
        assert any("Days_Since_Last_Service" in e for e in result["errors"])

    def test_km_equal_to_odometer_is_accepted(self):
        result = validate_input(_copy(Km_Since_Last_Service=90000, Odometer_Km=90000))
        assert result["errors"] == []

    def test_days_equal_to_vehicle_age_days_is_accepted(self):
        # 1 year = 365 days exactly
        result = validate_input(_copy(
            Vehicle_Age_Years=1,
            Days_Since_Last_Service=365,
        ))
        assert result["errors"] == []
