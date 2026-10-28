"""
train_model.py
--------------
Trains the Vehicle Maintenance Prediction model and saves:
  - models/maintenance_pipeline.joblib   (fitted scikit-learn Pipeline)
  - reports/metrics.json                 (evaluation metrics for both models)
  - reports/confusion_matrix.png         (labeled confusion matrix)

Run from the project root:
    python train_model.py

NOTE: This script uses a *synthetic* dataset created for educational purposes.
      The model and its metrics are not validated for real-world maintenance
      decisions.  Do not use predictions as a substitute for professional
      vehicle inspection.
"""

import json
import os
import sys

import joblib
import matplotlib
matplotlib.use("Agg")          # non-interactive backend (safe for all platforms)
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from validation import ALL_FEATURES, CATEGORICAL_FEATURES, NUMERIC_FEATURES

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_PATH   = os.path.join(BASE_DIR, "data", "vehicle_maintenance_synthetic.csv")
MODELS_DIR  = os.path.join(BASE_DIR, "models")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
MODEL_PATH  = os.path.join(MODELS_DIR, "maintenance_pipeline.joblib")
METRICS_PATH = os.path.join(REPORTS_DIR, "metrics.json")
CM_PATH     = os.path.join(REPORTS_DIR, "confusion_matrix.png")

# ── Target definition ─────────────────────────────────────────────────────────
TARGET_COL = "Maintenance_Needed_30_Days"


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_and_validate_csv(path: str) -> pd.DataFrame:
    """Load CSV and perform basic schema validation."""
    if not os.path.exists(path):
        sys.exit(f"[ERROR] Dataset not found at: {path}")

    df = pd.read_csv(path)
    print(f"[INFO] Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns.")

    required_cols = set(ALL_FEATURES + [TARGET_COL])
    missing_cols  = required_cols - set(df.columns)
    if missing_cols:
        sys.exit(f"[ERROR] Dataset is missing columns: {missing_cols}")

    # Warn about nulls but do not abort (pipeline handles imputation)
    null_counts = df[ALL_FEATURES + [TARGET_COL]].isnull().sum()
    nulls_found = null_counts[null_counts > 0]
    if not nulls_found.empty:
        print("[WARN] Null values found (will be handled by imputation):")
        print(nulls_found.to_string())

    target_values = set(df[TARGET_COL].dropna().unique())
    if not target_values.issubset({0, 1}):
        sys.exit(
            f"[ERROR] Target column '{TARGET_COL}' must contain only 0 and 1; "
            f"found: {target_values}"
        )

    return df


def build_pipeline() -> Pipeline:
    """Build a scikit-learn Pipeline with preprocessing + RandomForest."""

    numeric_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="median")),
    ])

    categorical_transformer = Pipeline(steps=[
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot",  OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    preprocessor = ColumnTransformer(transformers=[
        ("num", numeric_transformer,     NUMERIC_FEATURES),
        ("cat", categorical_transformer, CATEGORICAL_FEATURES),
    ])

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("classifier",   RandomForestClassifier(
            random_state=42,
            class_weight="balanced",
        )),
    ])

    return pipeline


def compute_metrics(name: str, y_true, y_pred, y_prob) -> dict:
    """Compute classification metrics and return as a labelled dict."""
    cm = confusion_matrix(y_true, y_pred).tolist()
    return {
        "model":     name,
        "accuracy":  round(accuracy_score(y_true, y_pred),        4),
        "precision": round(precision_score(y_true, y_pred,
                                           zero_division=0),       4),
        "recall":    round(recall_score(y_true, y_pred,
                                        zero_division=0),          4),
        "f1_score":  round(f1_score(y_true, y_pred,
                                    zero_division=0),              4),
        "roc_auc":   round(roc_auc_score(y_true, y_prob),         4),
        "confusion_matrix": {
            "matrix":       cm,
            "labels":       ["No Maintenance (0)", "Maintenance (1)"],
            "true_negative":  cm[0][0],
            "false_positive": cm[0][1],
            "false_negative": cm[1][0],
            "true_positive":  cm[1][1],
        },
    }


def save_confusion_matrix(cm_data: dict, path: str) -> None:
    """Save a labelled heatmap of the RandomForest confusion matrix."""
    matrix = np.array(cm_data["matrix"])
    labels = ["No Maint. (0)", "Maint. (1)"]

    fig, ax = plt.subplots(figsize=(6, 5))
    sns.heatmap(
        matrix,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=labels,
        yticklabels=labels,
        ax=ax,
        linewidths=0.5,
    )
    ax.set_xlabel("Predicted Label", fontsize=12)
    ax.set_ylabel("True Label",      fontsize=12)
    ax.set_title(
        "Confusion Matrix — RandomForestClassifier\n"
        "(Synthetic data — educational use only)",
        fontsize=11,
    )
    plt.tight_layout()
    plt.savefig(path, dpi=150)
    plt.close()
    print(f"[INFO] Confusion matrix saved → {path}")


# ── Main training routine ─────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Vehicle Maintenance Prediction — Model Training")
    print("  NOTE: Synthetic dataset, educational use only.")
    print("=" * 60)

    os.makedirs(MODELS_DIR,  exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)

    # 1. Load & validate
    df = load_and_validate_csv(DATA_PATH)

    # 2. Split features / target
    X = df[ALL_FEATURES]
    y = df[TARGET_COL]

    print(f"[INFO] Target distribution:\n{y.value_counts().to_string()}")

    # 3. Stratified 80/20 split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"[INFO] Train size: {len(X_train)}, Test size: {len(X_test)}")

    # 4. Build and train RandomForest pipeline
    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)
    print("[INFO] RandomForestClassifier pipeline trained.")

    # 5. Evaluate RandomForest
    y_pred_rf   = pipeline.predict(X_test)
    y_prob_rf   = pipeline.predict_proba(X_test)[:, 1]
    rf_metrics  = compute_metrics("RandomForestClassifier", y_test, y_pred_rf, y_prob_rf)

    # 6. Baseline DummyClassifier
    dummy = DummyClassifier(strategy="most_frequent", random_state=42)
    dummy.fit(X_train, y_train)
    y_pred_dummy = dummy.predict(X_test)
    # DummyClassifier with most_frequent: predict_proba is constant
    y_prob_dummy = dummy.predict_proba(X_test)[:, 1]
    dummy_metrics = compute_metrics("DummyClassifier (baseline)", y_test, y_pred_dummy, y_prob_dummy)

    # 7. Print comparison
    print("\n── Evaluation Results ──────────────────────────────────")
    for m in (rf_metrics, dummy_metrics):
        print(f"\n  {m['model']}")
        print(f"    Accuracy : {m['accuracy']}")
        print(f"    Precision: {m['precision']}")
        print(f"    Recall   : {m['recall']}")
        print(f"    F1 Score : {m['f1_score']}")
        print(f"    ROC-AUC  : {m['roc_auc']}")
    print()

    # 8. Save metrics JSON
    report = {
        "data_notice": (
            "Model trained on a synthetic dataset generated for educational "
            "purposes.  Metrics reflect performance on held-out synthetic data "
            "only and are NOT indicative of real-world maintenance prediction accuracy."
        ),
        "train_size":  len(X_train),
        "test_size":   len(X_test),
        "random_state": 42,
        "models": [rf_metrics, dummy_metrics],
    }
    with open(METRICS_PATH, "w") as f:
        json.dump(report, f, indent=2)
    print(f"[INFO] Metrics saved → {METRICS_PATH}")

    # 9. Save confusion matrix image
    save_confusion_matrix(rf_metrics["confusion_matrix"], CM_PATH)

    # 10. Save fitted pipeline
    joblib.dump(pipeline, MODEL_PATH)
    print(f"[INFO] Pipeline saved → {MODEL_PATH}")

    print("\n[DONE] Training complete.")


if __name__ == "__main__":
    main()
