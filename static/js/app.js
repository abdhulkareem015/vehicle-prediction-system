/**
 * app.js — Vehicle Maintenance Prediction System
 *
 * Connects to the Flask backend via:
 *   GET  /api/health
 *   GET  /api/model-info
 *   POST /api/predict
 *
 * All API calls use relative URLs (same-origin, served by Flask).
 * Server-provided text is always set via textContent, never innerHTML.
 */

"use strict";

/* ── Constants ──────────────────────────────────────────────────────────── */
const EXAMPLE_PAYLOAD = {
  Vehicle_Age_Years:       6,
  Fuel_Type:               "Diesel",
  Odometer_Km:             90000,
  Average_Daily_Km:        45,
  Days_Since_Last_Service: 210,
  Km_Since_Last_Service:   9500,
  Previous_Repairs_Count:  3,
  Driving_Condition:       "City",
};

/* ── DOM references ─────────────────────────────────────────────────────── */
const form            = document.getElementById("predict-form");
const btnPredict      = document.getElementById("btn-predict");
const btnExample      = document.getElementById("btn-example");
const btnReset        = document.getElementById("btn-reset");
const loadingOverlay  = document.getElementById("loading-overlay");
const errorAlert      = document.getElementById("error-alert");
const errorBody       = document.getElementById("error-body");
const healthBanner    = document.getElementById("health-banner");
const resultPanel     = document.getElementById("result-panel");
const resultContent   = document.getElementById("result-content");
const resultEmpty     = document.getElementById("result-empty");
const liveRegion      = document.getElementById("live-region");

// Result content elements
const outcomeBox      = document.getElementById("outcome-box");
const outcomeIcon     = document.getElementById("outcome-icon");
const outcomeTitle    = document.getElementById("outcome-title");
const outcomeSub      = document.getElementById("outcome-sub");
const probValue       = document.getElementById("prob-value");
const probBarFill     = document.getElementById("prob-bar-fill");
const probCaveat      = document.getElementById("prob-caveat");
const resultMessage   = document.getElementById("result-message");
const resultNotice    = document.getElementById("result-notice");

// Model info elements
const modelNameEl     = document.getElementById("model-name");
const modelTargetEl   = document.getElementById("model-target");
const metricsGrid     = document.getElementById("metrics-grid");
const metricsNotice   = document.getElementById("metrics-notice");
const modelInfoStatus = document.getElementById("model-info-status");

/* ── Health check ───────────────────────────────────────────────────────── */
async function checkHealth() {
  try {
    const res  = await fetch("/api/health");
    const data = await res.json();

    if (!data.model_loaded) {
      showBanner("warning",
        "⚠️  No trained model is available.  " +
        "Run  python train_model.py  in your terminal, then reload this page."
      );
    }
  } catch (_) {
    showBanner("danger",
      "⚠️  Cannot reach the Flask backend.  " +
      "Make sure  python app.py  is running on port 5000."
    );
    btnPredict.disabled = true;
  }
}

function showBanner(type, message) {
  healthBanner.className = `alert alert-${type} show d-flex align-items-start gap-2 mb-3`;
  // Use textContent on a span to avoid XSS with server text
  healthBanner.textContent = "";
  const span = document.createElement("span");
  span.textContent = message;
  healthBanner.appendChild(span);
}

/* ── Model info ─────────────────────────────────────────────────────────── */
async function loadModelInfo() {
  try {
    const res  = await fetch("/api/model-info");
    const data = await res.json();

    // Model name and target
    setText(modelNameEl,   data.model_name   || "Not available");
    setText(modelTargetEl, data.target_column || "Not available");

    // Evaluation metrics — use the first model (RandomForestClassifier)
    const em = data.evaluation_metrics;
    if (em && Array.isArray(em.models) && em.models.length > 0) {
      const rf = em.models[0];
      renderMetricsGrid(rf);
      // Synthetic data notice from the metrics JSON
      if (em.data_notice) {
        setText(metricsNotice, em.data_notice);
      }
    } else {
      metricsGrid.textContent = "Evaluation metrics not available.";
    }

    // Status
    if (modelInfoStatus) modelInfoStatus.style.display = "none";

  } catch (_) {
    setText(modelNameEl,   "Not available");
    setText(modelTargetEl, "Not available");
    if (metricsGrid) metricsGrid.textContent = "Could not load model information.";
  }
}

function renderMetricsGrid(model) {
  const metrics = [
    { name: "Accuracy",  val: model.accuracy  },
    { name: "Precision", val: model.precision },
    { name: "Recall",    val: model.recall    },
    { name: "F1 Score",  val: model.f1_score  },
    { name: "ROC-AUC",   val: model.roc_auc   },
  ];

  metricsGrid.innerHTML = "";   // safe: we build it ourselves

  metrics.forEach(({ name, val }) => {
    const item  = document.createElement("div");
    item.className = "metric-item";

    const valEl = document.createElement("span");
    valEl.className = "metric-val";
    valEl.textContent = (val !== undefined && val !== null)
      ? (val * 100).toFixed(1) + "%"
      : "N/A";

    const nameEl = document.createElement("span");
    nameEl.className = "metric-name";
    nameEl.textContent = name;

    item.appendChild(valEl);
    item.appendChild(nameEl);
    metricsGrid.appendChild(item);
  });
}

/* ── Client-side validation ─────────────────────────────────────────────── */
/**
 * Returns an object:
 *   { valid: bool, errors: Map<fieldName, string>, payload: object|null }
 *
 * Mirrors the backend rules so the user sees errors immediately,
 * but the backend is always the final authority.
 */
function validateForm() {
  const errors  = new Map();
  const payload = {};

  // ── Helpers ──
  const field  = (id) => document.getElementById(id);
  const rawVal = (id) => field(id)?.value.trim();

  // Vehicle_Age_Years — float, > 0
  const ageStr = rawVal("Vehicle_Age_Years");
  if (!ageStr) {
    errors.set("Vehicle_Age_Years", "Vehicle age is required.");
  } else {
    const age = parseFloat(ageStr);
    if (isNaN(age))       errors.set("Vehicle_Age_Years", "Must be a number.");
    else if (age <= 0)    errors.set("Vehicle_Age_Years", "Must be greater than zero.");
    else                  payload.Vehicle_Age_Years = age;
  }

  // Fuel_Type — dropdown
  const fuelVal = rawVal("Fuel_Type");
  if (!fuelVal) {
    errors.set("Fuel_Type", "Please select a fuel type.");
  } else {
    payload.Fuel_Type = fuelVal;
  }

  // Odometer_Km — float, ≥ 0
  const odoStr = rawVal("Odometer_Km");
  if (!odoStr && odoStr !== "0") {
    errors.set("Odometer_Km", "Odometer reading is required.");
  } else {
    const odo = parseFloat(odoStr);
    if (isNaN(odo))     errors.set("Odometer_Km", "Must be a number.");
    else if (odo < 0)   errors.set("Odometer_Km", "Must be 0 or greater.");
    else                payload.Odometer_Km = odo;
  }

  // Average_Daily_Km — float, ≥ 0
  const dailyStr = rawVal("Average_Daily_Km");
  if (!dailyStr && dailyStr !== "0") {
    errors.set("Average_Daily_Km", "Average daily distance is required.");
  } else {
    const daily = parseFloat(dailyStr);
    if (isNaN(daily))    errors.set("Average_Daily_Km", "Must be a number.");
    else if (daily < 0)  errors.set("Average_Daily_Km", "Must be 0 or greater.");
    else                 payload.Average_Daily_Km = daily;
  }

  // Days_Since_Last_Service — integer, ≥ 0
  const daysStr = rawVal("Days_Since_Last_Service");
  if (!daysStr && daysStr !== "0") {
    errors.set("Days_Since_Last_Service", "Days since last service is required.");
  } else {
    const days = Number(daysStr);
    if (!Number.isInteger(days) || isNaN(days)) {
      errors.set("Days_Since_Last_Service", "Must be a whole number (integer).");
    } else if (days < 0) {
      errors.set("Days_Since_Last_Service", "Must be 0 or greater.");
    } else {
      payload.Days_Since_Last_Service = days;
    }
  }

  // Km_Since_Last_Service — float, ≥ 0
  const kmSvcStr = rawVal("Km_Since_Last_Service");
  if (!kmSvcStr && kmSvcStr !== "0") {
    errors.set("Km_Since_Last_Service", "Km since last service is required.");
  } else {
    const kmSvc = parseFloat(kmSvcStr);
    if (isNaN(kmSvc))     errors.set("Km_Since_Last_Service", "Must be a number.");
    else if (kmSvc < 0)   errors.set("Km_Since_Last_Service", "Must be 0 or greater.");
    else                  payload.Km_Since_Last_Service = kmSvc;
  }

  // Previous_Repairs_Count — integer, ≥ 0
  const repairsStr = rawVal("Previous_Repairs_Count");
  if (!repairsStr && repairsStr !== "0") {
    errors.set("Previous_Repairs_Count", "Repairs count is required.");
  } else {
    const repairs = Number(repairsStr);
    if (!Number.isInteger(repairs) || isNaN(repairs)) {
      errors.set("Previous_Repairs_Count", "Must be a whole number (integer).");
    } else if (repairs < 0) {
      errors.set("Previous_Repairs_Count", "Must be 0 or greater.");
    } else {
      payload.Previous_Repairs_Count = repairs;
    }
  }

  // Driving_Condition — dropdown
  const condVal = rawVal("Driving_Condition");
  if (!condVal) {
    errors.set("Driving_Condition", "Please select a driving condition.");
  } else {
    payload.Driving_Condition = condVal;
  }

  // ── Cross-field rules (only if all individual fields passed) ──
  if (!errors.size) {
    const age   = payload.Vehicle_Age_Years;
    const days  = payload.Days_Since_Last_Service;
    const odo   = payload.Odometer_Km;
    const kmSvc = payload.Km_Since_Last_Service;

    if (kmSvc > odo) {
      errors.set("Km_Since_Last_Service",
        "Cannot exceed total odometer reading (" + odo.toLocaleString() + " km).");
    }

    const maxDays = age * 365;
    if (days > maxDays) {
      errors.set("Days_Since_Last_Service",
        "Cannot exceed vehicle age in days (" + Math.floor(maxDays) + " days).");
    }
  }

  return {
    valid:   errors.size === 0,
    errors,
    payload: errors.size === 0 ? payload : null,
  };
}

/* ── Field error display ────────────────────────────────────────────────── */
function clearFieldErrors() {
  form.querySelectorAll(".form-control, .form-select").forEach((el) => {
    el.classList.remove("is-invalid");
  });
  form.querySelectorAll(".invalid-feedback").forEach((el) => {
    el.textContent = "";
  });
}

function showFieldErrors(errors) {
  errors.forEach((message, fieldName) => {
    const input = document.getElementById(fieldName);
    const fb    = document.getElementById(fieldName + "-error");
    if (input) input.classList.add("is-invalid");
    if (fb)    fb.textContent = message;
  });

  // Focus first invalid field for keyboard users
  const firstBad = form.querySelector(".is-invalid");
  if (firstBad) firstBad.focus();
}

/* ── Result panel ───────────────────────────────────────────────────────── */
function showEmptyState() {
  resultContent.classList.remove("show");
  resultEmpty.style.display = "flex";
  resultPanel.classList.remove("stale");
}

function showResult(data) {
  resultEmpty.style.display   = "none";
  resultContent.classList.add("show");
  resultPanel.classList.remove("stale");

  const needed = data.maintenance_needed;   // boolean
  const prob   = data.maintenance_probability;  // 0-1 float
  const pct    = Math.round(prob * 100);

  // Outcome badge styling
  outcomeBox.className = "outcome-badge " + (needed ? "outcome-amber" : "outcome-teal");

  // Icon — purely decorative, meaning carried by text
  outcomeIcon.setAttribute("aria-hidden", "true");
  outcomeIcon.textContent = needed ? "⚠️" : "✅";

  // Titles (no server text here — hard-coded based on prediction integer)
  outcomeTitle.textContent = needed
    ? "Maintenance predicted within 30 days"
    : "Maintenance not predicted within 30 days";

  outcomeSub.textContent = needed
    ? "Scheduling a service inspection is advisable."
    : "Continue monitoring the vehicle.";

  // Probability
  probValue.textContent = pct + "%";
  probBarFill.style.width = pct + "%";
  probBarFill.className   = "prob-bar-fill" + (needed ? " high" : "");
  probBarFill.setAttribute("aria-valuenow", pct);

  // Backend message — server text, set via textContent only
  setText(resultMessage, data.message || "");

  // Data notice — server text
  setText(resultNotice, data.data_notice || "");

  // Announce to screen readers
  announce(outcomeTitle.textContent + ". Model estimate: " + pct + "%.");
}

/* ── Error display ──────────────────────────────────────────────────────── */
function hideErrorAlert() {
  errorAlert.classList.remove("show");
  errorBody.textContent = "";
  errorAlert.querySelectorAll(".error-list").forEach(el => el.remove());
}

function showErrorAlert(message, fieldErrors) {
  hideErrorAlert();
  errorAlert.classList.add("show");

  const heading = document.createElement("strong");
  heading.textContent = message;
  errorBody.appendChild(heading);

  if (fieldErrors && fieldErrors.length) {
    const ul = document.createElement("ul");
    ul.className = "error-list";
    fieldErrors.forEach((err) => {
      const li = document.createElement("li");
      li.textContent = err;
      ul.appendChild(li);
    });
    errorBody.appendChild(ul);
  }

  announce("Error: " + message);
  errorAlert.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ── Loading state ──────────────────────────────────────────────────────── */
function setLoading(loading) {
  btnPredict.disabled = loading;
  if (loading) {
    loadingOverlay.classList.add("active");
    resultPanel.classList.add("stale");         // dim previous result
    btnPredict.setAttribute("aria-busy", "true");
  } else {
    loadingOverlay.classList.remove("active");
    resultPanel.classList.remove("stale");
    btnPredict.removeAttribute("aria-busy");
  }
}

/* ── Predict ────────────────────────────────────────────────────────────── */
async function submitPrediction(payload) {
  setLoading(true);
  hideErrorAlert();

  try {
    const res  = await fetch("/api/predict", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      showResult(data);
    } else if (res.status === 503) {
      // Model not trained
      showErrorAlert(
        data.error || "The prediction model is not available.",
        null
      );
      showEmptyState();
    } else if (res.status === 400) {
      // Backend validation errors (fields array of strings)
      if (data.fields && Array.isArray(data.fields)) {
        // Try to map them back to field highlights
        mapBackendErrors(data.fields);
        showErrorAlert("Please fix the highlighted fields:", data.fields);
      } else {
        showErrorAlert(data.error || "Invalid request.", null);
      }
      showEmptyState();
    } else {
      showErrorAlert(
        "An unexpected error occurred (HTTP " + res.status + ").",
        null
      );
      showEmptyState();
    }
  } catch (networkErr) {
    showErrorAlert(
      "Network error — the backend could not be reached.  " +
      "Make sure  python app.py  is running.",
      null
    );
    showEmptyState();
  } finally {
    setLoading(false);
  }
}

/**
 * Attempt to highlight form fields mentioned in backend error strings.
 * The backend returns English sentences like
 *   "Vehicle_Age_Years must be greater than zero."
 * so we match on the field name prefix.
 */
function mapBackendErrors(fieldErrors) {
  const FIELDS = [
    "Vehicle_Age_Years", "Fuel_Type", "Odometer_Km",
    "Average_Daily_Km", "Days_Since_Last_Service",
    "Km_Since_Last_Service", "Previous_Repairs_Count", "Driving_Condition",
  ];

  fieldErrors.forEach((msg) => {
    FIELDS.forEach((name) => {
      if (msg.includes(name)) {
        const input = document.getElementById(name);
        const fb    = document.getElementById(name + "-error");
        if (input) input.classList.add("is-invalid");
        if (fb)    fb.textContent = msg;
      }
    });
  });
}

/* ── Form submit handler ────────────────────────────────────────────────── */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  clearFieldErrors();
  hideErrorAlert();

  const { valid, errors, payload } = validateForm();

  if (!valid) {
    showFieldErrors(errors);
    // Build an error list for the alert too
    const messages = Array.from(errors.values());
    showErrorAlert("Please fix the following errors:", messages);
    return;
  }

  submitPrediction(payload);
});

/* ── Load Example button ────────────────────────────────────────────────── */
btnExample.addEventListener("click", () => {
  clearFieldErrors();
  hideErrorAlert();

  Object.entries(EXAMPLE_PAYLOAD).forEach(([key, val]) => {
    const el = document.getElementById(key);
    if (el) el.value = val;
  });

  announce("Example values loaded. Press Predict Maintenance to run a prediction.");
});

/* ── Reset button ───────────────────────────────────────────────────────── */
btnReset.addEventListener("click", () => {
  form.reset();
  clearFieldErrors();
  hideErrorAlert();
  showEmptyState();
  announce("Form cleared.");
});

/* ── Accessible live announcements ─────────────────────────────────────── */
function announce(message) {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  // Brief delay ensures screen readers catch the change
  setTimeout(() => { liveRegion.textContent = message; }, 50);
}

/* ── Utility: safe text setter ──────────────────────────────────────────── */
function setText(el, text) {
  if (el) el.textContent = text;
}

/* ── Boot ───────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  loadModelInfo();
  showEmptyState();
});
