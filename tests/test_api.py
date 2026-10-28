"""
tests/test_api.py
-----------------
Integration tests for the Flask API endpoints.

Tests are organised into three groups:
  1. Valid prediction  – when the model is loaded
  2. Invalid input     – HTTP 400 responses
  3. Missing model     – HTTP 503 response (model monkeypatched to None)

Run with:
    python -m pytest tests/ -v
"""

import json
import os
import sys
import types

import pytest

# Make project root importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture()
def client_with_model(tmp_path, monkeypatch):
    """
    Provides a test client with a real (or mock) pipeline loaded.

    If a real trained model exists at models/maintenance_pipeline.joblib,
    it is used.  Otherwise a lightweight mock pipeline is injected so the
    structural / HTTP-layer tests can run without requiring training first.
    """
    import app as app_module

    model_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "models", "maintenance_pipeline.joblib",
    )

    if os.path.exists(model_path):
        # Use the real trained pipeline
        import joblib
        monkeypatch.setattr(app_module, "pipeline", joblib.load(model_path))
    else:
        # Inject a minimal mock that returns deterministic outputs
        mock_pipeline = _build_mock_pipeline()
        monkeypatch.setattr(app_module, "pipeline", mock_pipeline)

    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


@pytest.fixture()
def client_no_model(monkeypatch):
    """Provides a test client with no pipeline loaded (simulates missing model)."""
    import app as app_module
    monkeypatch.setattr(app_module, "pipeline", None)
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as c:
        yield c


def _build_mock_pipeline():
    """
    Build a minimal object that quacks like a fitted sklearn Pipeline for
    the two methods the app calls: predict() and predict_proba().
    """
    import numpy as np

    class MockPipeline:
        def predict(self, X):
            return [1]           # always predict maintenance needed

        def predict_proba(self, X):
            return [[0.2, 0.8]]  # 80 % probability for class 1

    return MockPipeline()


# ── Shared helpers ─────────────────────────────────────────────────────────────

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


def post_predict(client, payload):
    return client.post(
        "/api/predict",
        data=json.dumps(payload),
        content_type="application/json",
    )


# ── 1. Valid prediction tests ──────────────────────────────────────────────────

class TestValidPrediction:

    def test_returns_200(self, client_with_model):
        response = post_predict(client_with_model, VALID_PAYLOAD)
        assert response.status_code == 200

    def test_response_has_required_keys(self, client_with_model):
        body = post_predict(client_with_model, VALID_PAYLOAD).get_json()
        for key in ("prediction", "maintenance_needed", "maintenance_probability", "message", "data_notice"):
            assert key in body, f"Missing key: {key}"

    def test_prediction_is_0_or_1(self, client_with_model):
        body = post_predict(client_with_model, VALID_PAYLOAD).get_json()
        assert body["prediction"] in (0, 1)

    def test_maintenance_needed_matches_prediction(self, client_with_model):
        body = post_predict(client_with_model, VALID_PAYLOAD).get_json()
        assert body["maintenance_needed"] == bool(body["prediction"])

    def test_probability_in_range(self, client_with_model):
        body = post_predict(client_with_model, VALID_PAYLOAD).get_json()
        prob = body["maintenance_probability"]
        assert 0.0 <= prob <= 1.0

    def test_data_notice_present(self, client_with_model):
        body = post_predict(client_with_model, VALID_PAYLOAD).get_json()
        assert "synthetic" in body["data_notice"].lower()

    def test_all_driving_conditions_accepted(self, client_with_model):
        for cond in ("City", "Highway", "Mixed", "Rough"):
            payload = {**VALID_PAYLOAD, "Driving_Condition": cond}
            resp = post_predict(client_with_model, payload)
            assert resp.status_code == 200, f"Failed for Driving_Condition={cond}"

    def test_petrol_fuel_type_accepted(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Fuel_Type": "Petrol"}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 200


# ── 2. Invalid input tests ─────────────────────────────────────────────────────

class TestInvalidInput:

    def test_empty_body_returns_400(self, client_with_model):
        resp = client_with_model.post(
            "/api/predict",
            data="{}",
            content_type="application/json",
        )
        assert resp.status_code == 400

    def test_non_json_body_returns_400(self, client_with_model):
        resp = client_with_model.post(
            "/api/predict",
            data="not json at all",
            content_type="text/plain",
        )
        assert resp.status_code == 400

    def test_missing_field_returns_400(self, client_with_model):
        payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "Fuel_Type"}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_unknown_field_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Colour": "Red"}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_invalid_fuel_type_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Fuel_Type": "Electric"}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_invalid_driving_condition_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Driving_Condition": "Dirt"}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_boolean_for_numeric_field_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Vehicle_Age_Years": True}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_float_for_integer_field_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Days_Since_Last_Service": 210.5}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_vehicle_age_zero_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Vehicle_Age_Years": 0}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_negative_odometer_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Odometer_Km": -1}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_km_since_service_exceeds_odometer_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Km_Since_Last_Service": 99999, "Odometer_Km": 90000}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_days_exceeds_vehicle_age_days_returns_400(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Vehicle_Age_Years": 1, "Days_Since_Last_Service": 400}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400

    def test_error_response_contains_fields_key(self, client_with_model):
        payload = {**VALID_PAYLOAD, "Fuel_Type": "LPG"}
        body = post_predict(client_with_model, payload).get_json()
        assert "fields" in body or "error" in body

    def test_nan_in_numeric_field_returns_400(self, client_with_model):
        # JSON does not support NaN natively; send as a string to simulate bad input
        payload = {**VALID_PAYLOAD, "Odometer_Km": "NaN"}
        resp = post_predict(client_with_model, payload)
        assert resp.status_code == 400


# ── 3. Missing model tests ─────────────────────────────────────────────────────

class TestMissingModel:

    def test_predict_returns_503_when_no_model(self, client_no_model):
        resp = post_predict(client_no_model, VALID_PAYLOAD)
        assert resp.status_code == 503

    def test_503_response_is_json(self, client_no_model):
        resp = post_predict(client_no_model, VALID_PAYLOAD)
        assert resp.content_type == "application/json"
        body = resp.get_json()
        assert "error" in body

    def test_health_returns_200_even_without_model(self, client_no_model):
        resp = client_no_model.get("/api/health")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["model_loaded"] is False


# ── 4. Health and model-info endpoint tests ────────────────────────────────────

class TestHealthEndpoint:

    def test_health_with_model_loaded(self, client_with_model):
        resp = client_with_model.get("/api/health")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["status"] == "ok"
        assert body["model_loaded"] is True

    def test_health_is_json(self, client_with_model):
        resp = client_with_model.get("/api/health")
        assert "application/json" in resp.content_type


class TestModelInfoEndpoint:

    def test_model_info_returns_200(self, client_with_model):
        resp = client_with_model.get("/api/model-info")
        assert resp.status_code == 200

    def test_model_info_has_required_keys(self, client_with_model):
        body = client_with_model.get("/api/model-info").get_json()
        for key in ("model_name", "input_fields", "accepted_categorical_values",
                    "target_meaning", "data_notice"):
            assert key in body, f"Missing key: {key}"

    def test_model_info_accepted_fuel_types(self, client_with_model):
        body = client_with_model.get("/api/model-info").get_json()
        fuel_types = body["accepted_categorical_values"]["Fuel_Type"]
        assert "Diesel" in fuel_types
        assert "Petrol" in fuel_types

    def test_404_for_unknown_route(self, client_with_model):
        resp = client_with_model.get("/api/unknown-route")
        assert resp.status_code == 404
