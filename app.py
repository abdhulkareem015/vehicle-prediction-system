"""
app.py
------
Flask API for the Vehicle Maintenance Prediction System.

Endpoints:
    GET  /api/health       – liveness check + model availability
    GET  /api/model-info   – metadata, accepted values, and saved metrics
    POST /api/predict      – single-record maintenance prediction

NOTE: The model is trained on a *synthetic* dataset created for educational
      purposes.  Predictions must NOT be used for real-world vehicle maintenance
      decisions.

Start the server:
    python app.py
"""

import json
import os

import joblib
import pandas as pd
from flask import Flask, jsonify, render_template, request

from validation import (
    ALL_FEATURES,           # re-exported from validation for convenience
    ALLOWED_DRIVING_CONDITIONS,
    ALLOWED_FUEL_TYPES,
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    validate_input,
)

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH   = os.path.join(BASE_DIR, "models", "maintenance_pipeline.joblib")
METRICS_PATH = os.path.join(BASE_DIR, "reports", "metrics.json")

DATA_NOTICE = (
    "Model trained on synthetic data; for educational demonstration."
)

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

# ── Load model once at startup ────────────────────────────────────────────────
pipeline = None
if os.path.exists(MODEL_PATH):
    try:
        pipeline = joblib.load(MODEL_PATH)
        print(f"[INFO] Model loaded from {MODEL_PATH}")
    except Exception as exc:
        print(f"[WARN] Could not load model: {exc}")
else:
    print(
        "[WARN] No trained model found.  "
        "Run  python train_model.py  to train the model first."
    )


# ── Helper ────────────────────────────────────────────────────────────────────

def _load_metrics() -> dict | None:
    """Return the saved evaluation metrics dict, or None if not found."""
    if os.path.exists(METRICS_PATH):
        try:
            with open(METRICS_PATH, "r") as f:
                return json.load(f)
        except Exception:
            return None
    return None


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
@app.route("/dashboard", methods=["GET"])
def dashboard():
    """Dashboard page."""
    return render_template("dashboard.html")


@app.route("/predict", methods=["GET"])
def predict_page():
    """Prediction form page."""
    return render_template("predict.html")


@app.route("/performance", methods=["GET"])
def performance():
    """Model performance page."""
    return render_template("performance.html")


@app.route("/api/health", methods=["GET"])
def health():
    """Return API status and whether a trained model is available."""
    return jsonify({
        "status":        "ok",
        "model_loaded":  pipeline is not None,
        "model_path":    MODEL_PATH,
        "message": (
            "Model is ready for predictions."
            if pipeline is not None
            else "No model found.  Run python train_model.py to train."
        ),
    }), 200


@app.route("/api/model-info", methods=["GET"])
def model_info():
    """Return model metadata and saved evaluation metrics."""
    metrics = _load_metrics()
    return jsonify({
        "model_name":    "RandomForestClassifier",
        "target_column": "Maintenance_Needed_30_Days",
        "target_meaning": {
            "0": "Maintenance not predicted within the next 30 days.",
            "1": "Maintenance predicted within the next 30 days.",
        },
        "input_fields": {
            "numeric":     NUMERIC_FEATURES,
            "categorical": CATEGORICAL_FEATURES,
        },
        "accepted_categorical_values": {
            "Fuel_Type":        sorted(ALLOWED_FUEL_TYPES),
            "Driving_Condition": sorted(ALLOWED_DRIVING_CONDITIONS),
        },
        "integer_fields": ["Days_Since_Last_Service", "Previous_Repairs_Count"],
        "data_notice": DATA_NOTICE,
        "synthetic_data_warning": (
            "This model was trained on a synthetic dataset generated for "
            "educational purposes.  Evaluation metrics reflect held-out "
            "synthetic data only.  Do not use predictions as a substitute "
            "for professional vehicle inspection."
        ),
        "evaluation_metrics": metrics,
    }), 200


@app.route("/api/predict", methods=["POST"])
def predict():
    """Accept one vehicle record and return a maintenance prediction."""

    # ── Model availability check ──────────────────────────────────────────────
    if pipeline is None:
        return jsonify({
            "error": (
                "No trained model is available.  "
                "Run  python train_model.py  to train the model first."
            )
        }), 503

    # ── Parse request body ────────────────────────────────────────────────────
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    # ── Validate ──────────────────────────────────────────────────────────────
    result = validate_input(data)
    if result["errors"]:
        return jsonify({
            "error":  "Validation failed.",
            "fields": result["errors"],
        }), 400

    cleaned = result["cleaned"]

    # ── Build DataFrame in the correct feature order ──────────────────────────
    input_df = pd.DataFrame([cleaned])[NUMERIC_FEATURES + CATEGORICAL_FEATURES]

    # ── Predict ───────────────────────────────────────────────────────────────
    prediction  = int(pipeline.predict(input_df)[0])
    probability = float(pipeline.predict_proba(input_df)[0][1])

    if prediction == 1:
        message = (
            f"Maintenance is predicted within the next 30 days "
            f"(model probability estimate: {probability:.1%}).  "
            "Consider scheduling a service inspection."
        )
    else:
        message = (
            f"Maintenance is not predicted within the next 30 days "
            f"(model probability estimate: {probability:.1%}).  "
            "Continue monitoring the vehicle."
        )

    return jsonify({
        "prediction":             prediction,
        "maintenance_needed":     bool(prediction),
        "maintenance_probability": round(probability, 4),
        "message":                message,
        "data_notice":            DATA_NOTICE,
    }), 200


# ── Error handlers ────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Endpoint not found."}), 404
    return render_template("404.html"), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "HTTP method not allowed for this endpoint."}), 405


@app.errorhandler(500)
def internal_error(e):
    # Do not expose stack trace
    return jsonify({"error": "An internal server error occurred."}), 500


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
