/**
 * predict.js — prediction form page
 * Handles: client validation, POST /api/predict, result panel, stale detection.
 */
"use strict";

var announce = window.VehicleCare.announce;

var EXAMPLE = {
  Vehicle_Age_Years:       6,
  Fuel_Type:               "Diesel",
  Odometer_Km:             90000,
  Average_Daily_Km:        45,
  Days_Since_Last_Service: 210,
  Km_Since_Last_Service:   9500,
  Previous_Repairs_Count:  3,
  Driving_Condition:       "City"
};

var FIELD_LABELS = {
  Vehicle_Age_Years:       "Vehicle Age",
  Fuel_Type:               "Fuel Type",
  Odometer_Km:             "Odometer (km)",
  Average_Daily_Km:        "Avg. Daily (km)",
  Days_Since_Last_Service: "Days Since Service",
  Km_Since_Last_Service:   "Km Since Service",
  Previous_Repairs_Count:  "Repairs Count",
  Driving_Condition:       "Driving Condition"
};

/* Track last submitted payload to detect staleness */
var lastSubmitted = null;
var hasResult = false;

document.addEventListener("DOMContentLoaded", function () {
  var form       = document.getElementById("predict-form");
  var btnPredict = document.getElementById("btn-predict");
  var btnExample = document.getElementById("btn-example");
  var btnReset   = document.getElementById("btn-reset");

  /* Load example */
  btnExample.addEventListener("click", function () {
    clearErrors();
    clearErrorAlert();
    Object.entries(EXAMPLE).forEach(function ([k, v]) {
      var el = document.getElementById(k);
      if (el) el.value = v;
    });
    if (hasResult) markStale();
    announce("Example values loaded. Press Predict Maintenance to run.");
  });

  /* Reset */
  btnReset.addEventListener("click", function () {
    form.reset();
    clearErrors();
    clearErrorAlert();
    lastSubmitted = null;
    hasResult = false;
    showEmpty();
    hideStaleBanner();
    announce("Form cleared.");
  });

  /* Detect input changes after a result */
  form.querySelectorAll("input, select").forEach(function (el) {
    el.addEventListener("input", function () {
      if (hasResult) markStale();
    });
  });

  /* Submit */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();
    clearErrorAlert();

    var result = validateForm();
    if (!result.valid) {
      showFieldErrors(result.errors);
      showErrorAlert("Please fix the following errors:", Array.from(result.errors.values()));
      return;
    }

    submitPrediction(result.payload);
  });

  /* Check model availability on load */
  checkModel();
});

async function checkModel() {
  try {
    var res  = await fetch("/api/health");
    var data = await res.json();
    if (!data.model_loaded) {
      showErrorAlert(
        "No trained model is available.",
        ["Run  python train_model.py  in your terminal, then reload this page."]
      );
      document.getElementById("btn-predict").disabled = true;
    }
  } catch (_) {
    showErrorAlert("Cannot reach the Flask backend.", ["Make sure python app.py is running on port 5000."]);
    document.getElementById("btn-predict").disabled = true;
  }
}

/* ── Client-side validation ─────────────────────────────────── */
function validateForm() {
  var errors  = new Map();
  var payload = {};

  function raw(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  /* Vehicle_Age_Years */
  var ageStr = raw("Vehicle_Age_Years");
  if (!ageStr) { errors.set("Vehicle_Age_Years", "Vehicle age is required."); }
  else {
    var age = parseFloat(ageStr);
    if (isNaN(age))     errors.set("Vehicle_Age_Years", "Must be a number.");
    else if (age <= 0)  errors.set("Vehicle_Age_Years", "Must be greater than zero.");
    else payload.Vehicle_Age_Years = age;
  }

  /* Fuel_Type */
  var fuel = raw("Fuel_Type");
  if (!fuel) errors.set("Fuel_Type", "Please select a fuel type.");
  else payload.Fuel_Type = fuel;

  /* Odometer_Km */
  var odoStr = raw("Odometer_Km");
  if (odoStr === "") { errors.set("Odometer_Km", "Odometer reading is required."); }
  else {
    var odo = parseFloat(odoStr);
    if (isNaN(odo))   errors.set("Odometer_Km", "Must be a number.");
    else if (odo < 0) errors.set("Odometer_Km", "Must be 0 or greater.");
    else payload.Odometer_Km = odo;
  }

  /* Average_Daily_Km */
  var dailyStr = raw("Average_Daily_Km");
  if (dailyStr === "") { errors.set("Average_Daily_Km", "Average daily distance is required."); }
  else {
    var daily = parseFloat(dailyStr);
    if (isNaN(daily))    errors.set("Average_Daily_Km", "Must be a number.");
    else if (daily < 0)  errors.set("Average_Daily_Km", "Must be 0 or greater.");
    else payload.Average_Daily_Km = daily;
  }

  /* Days_Since_Last_Service — integer */
  var daysStr = raw("Days_Since_Last_Service");
  if (daysStr === "") { errors.set("Days_Since_Last_Service", "Required."); }
  else {
    var days = Number(daysStr);
    if (!Number.isInteger(days) || isNaN(days)) errors.set("Days_Since_Last_Service", "Must be a whole number.");
    else if (days < 0) errors.set("Days_Since_Last_Service", "Must be 0 or greater.");
    else payload.Days_Since_Last_Service = days;
  }

  /* Km_Since_Last_Service */
  var kmSvcStr = raw("Km_Since_Last_Service");
  if (kmSvcStr === "") { errors.set("Km_Since_Last_Service", "Required."); }
  else {
    var kmSvc = parseFloat(kmSvcStr);
    if (isNaN(kmSvc))    errors.set("Km_Since_Last_Service", "Must be a number.");
    else if (kmSvc < 0)  errors.set("Km_Since_Last_Service", "Must be 0 or greater.");
    else payload.Km_Since_Last_Service = kmSvc;
  }

  /* Previous_Repairs_Count — integer */
  var repStr = raw("Previous_Repairs_Count");
  if (repStr === "") { errors.set("Previous_Repairs_Count", "Required."); }
  else {
    var rep = Number(repStr);
    if (!Number.isInteger(rep) || isNaN(rep)) errors.set("Previous_Repairs_Count", "Must be a whole number.");
    else if (rep < 0) errors.set("Previous_Repairs_Count", "Must be 0 or greater.");
    else payload.Previous_Repairs_Count = rep;
  }

  /* Driving_Condition */
  var cond = raw("Driving_Condition");
  if (!cond) errors.set("Driving_Condition", "Please select a driving condition.");
  else payload.Driving_Condition = cond;

  /* Cross-field */
  if (!errors.size) {
    if (payload.Km_Since_Last_Service > payload.Odometer_Km) {
      errors.set("Km_Since_Last_Service",
        "Cannot exceed total odometer (" + payload.Odometer_Km.toLocaleString() + " km).");
    }
    var maxDays = payload.Vehicle_Age_Years * 365;
    if (payload.Days_Since_Last_Service > maxDays) {
      errors.set("Days_Since_Last_Service",
        "Cannot exceed vehicle age in days (" + Math.floor(maxDays) + " days).");
    }
  }

  return { valid: errors.size === 0, errors: errors, payload: errors.size === 0 ? payload : null };
}

/* ── Field error display ─────────────────────────────────────── */
function clearErrors() {
  document.querySelectorAll(".form-input.invalid, .form-select.invalid").forEach(function (el) {
    el.classList.remove("invalid");
  });
  document.querySelectorAll(".form-error").forEach(function (el) {
    el.textContent = "";
    el.classList.remove("show");
  });
}

function showFieldErrors(errors) {
  errors.forEach(function (msg, name) {
    var input = document.getElementById(name);
    var fb    = document.getElementById(name + "-error");
    if (input) input.classList.add("invalid");
    if (fb)    { fb.textContent = msg; fb.classList.add("show"); }
  });
  var first = document.querySelector(".form-input.invalid, .form-select.invalid");
  if (first) first.focus();
}

/* Map backend error strings back to fields */
var FIELD_NAMES = ["Vehicle_Age_Years","Fuel_Type","Odometer_Km","Average_Daily_Km",
                   "Days_Since_Last_Service","Km_Since_Last_Service","Previous_Repairs_Count","Driving_Condition"];
function mapBackendErrors(fieldErrors) {
  fieldErrors.forEach(function (msg) {
    FIELD_NAMES.forEach(function (name) {
      if (msg.includes(name)) {
        var input = document.getElementById(name);
        var fb    = document.getElementById(name + "-error");
        if (input) input.classList.add("invalid");
        if (fb)    { fb.textContent = msg; fb.classList.add("show"); }
      }
    });
  });
}

/* ── Error alert ─────────────────────────────────────────────── */
function clearErrorAlert() {
  var el = document.getElementById("error-alert");
  var body = document.getElementById("error-body");
  if (el) el.classList.remove("show");
  if (body) body.innerHTML = "";
}

function showErrorAlert(title, items) {
  var el   = document.getElementById("error-alert");
  var body = document.getElementById("error-body");
  if (!el || !body) return;

  body.innerHTML = "";
  var s = document.createElement("strong");
  s.textContent = title;
  body.appendChild(s);

  if (items && items.length) {
    var ul = document.createElement("ul");
    ul.className = "error-list";
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  el.classList.add("show");
  announce("Error: " + title);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ── Loading state ───────────────────────────────────────────── */
function setLoading(loading) {
  var btn     = document.getElementById("btn-predict");
  var content = document.getElementById("btn-predict-content");
  var row     = document.getElementById("loading-row");

  if (!btn) return;
  btn.disabled = loading;

  if (loading) {
    if (content) {
      content.innerHTML = '<div class="spinner" aria-hidden="true"></div> Predicting…';
    }
    if (row) row.style.display = "flex";
  } else {
    if (content) {
      content.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Predict Maintenance';
    }
    if (row) row.style.display = "none";
  }
}

/* ── Submit ──────────────────────────────────────────────────── */
async function submitPrediction(payload) {
  setLoading(true);
  clearErrorAlert();
  hideStaleBanner();

  try {
    var res  = await fetch("/api/predict", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    });
    var data = await res.json();

    if (res.ok) {
      lastSubmitted = Object.assign({}, payload);
      hasResult = true;
      showResult(data, payload);
    } else if (res.status === 503) {
      showErrorAlert(data.error || "Model not available.", null);
    } else if (res.status === 400) {
      if (data.fields && Array.isArray(data.fields)) {
        mapBackendErrors(data.fields);
        showErrorAlert("Validation errors from server:", data.fields);
      } else {
        showErrorAlert(data.error || "Invalid request.", null);
      }
    } else {
      showErrorAlert("Unexpected error (HTTP " + res.status + ").", null);
    }
  } catch (_) {
    showErrorAlert("Network error — make sure python app.py is running.", null);
  } finally {
    setLoading(false);
  }
}

/* ── Result display ──────────────────────────────────────────── */
function showEmpty() {
  var empty   = document.getElementById("result-empty");
  var content = document.getElementById("result-content");
  if (empty)   empty.style.display = "flex";
  if (content) content.style.display = "none";
}

function showResult(data, payload) {
  var empty   = document.getElementById("result-empty");
  var content = document.getElementById("result-content");
  if (empty)   empty.style.display = "none";
  if (content) content.style.display = "block";

  var needed = data.maintenance_needed;
  var prob   = data.maintenance_probability;
  var pct    = Math.round(prob * 100);

  /* Outcome badge */
  var badge = document.getElementById("outcome-badge");
  var icon  = document.getElementById("outcome-icon");
  var title = document.getElementById("outcome-title");
  var sub   = document.getElementById("outcome-sub");

  if (badge) {
    badge.className = "outcome-badge " + (needed ? "outcome-warn" : "outcome-ok");
  }

  if (icon) {
    if (needed) {
      icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>';
    } else {
      icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    }
  }

  if (title) title.textContent = needed
    ? "Maintenance predicted within 30 days"
    : "Maintenance not predicted within 30 days";

  if (sub) sub.textContent = needed
    ? "Consider scheduling a service inspection."
    : "Continue monitoring the vehicle.";

  /* Probability bar */
  var pctEl = document.getElementById("prob-pct");
  var fill  = document.getElementById("prob-fill");
  var track = fill && fill.closest("[role='progressbar']");

  if (pctEl) pctEl.textContent = pct + "%";
  if (fill) {
    fill.style.width = pct + "%";
    fill.className   = "prob-fill" + (needed ? " high" : "");
  }
  if (track) track.setAttribute("aria-valuenow", pct);

  /* Backend message */
  var msgEl = document.getElementById("result-message");
  if (msgEl) msgEl.textContent = data.message || "";

  /* Vehicle summary */
  renderVehicleSummary(payload);

  /* Data notice */
  var noticeEl = document.getElementById("data-notice");
  if (noticeEl) noticeEl.textContent = data.data_notice || "";

  /* Result status badge */
  var badgeEl = document.getElementById("result-status-badge");
  if (badgeEl) {
    badgeEl.className = "badge " + (needed ? "badge-warn" : "badge-success");
    badgeEl.textContent = needed ? "Maintenance due" : "On track";
  }

  announce(title ? title.textContent + ". Probability: " + pct + "%." : "Prediction complete.");
}

function renderVehicleSummary(payload) {
  var grid = document.getElementById("vehicle-summary-grid");
  if (!grid) return;
  grid.innerHTML = "";

  Object.entries(FIELD_LABELS).forEach(function ([k, label]) {
    var val = payload[k];
    if (val == null) return;
    var item = document.createElement("div");
    item.className = "vehicle-summary-item";

    var key = document.createElement("span");
    key.className = "vskey";
    key.textContent = label;

    var v = document.createElement("span");
    v.className = "vsval";
    v.textContent = String(val);

    item.appendChild(key);
    item.appendChild(v);
    grid.appendChild(item);
  });
}

/* ── Stale state ─────────────────────────────────────────────── */
function markStale() {
  var banner = document.getElementById("stale-banner");
  if (banner) banner.classList.add("show");
  var content = document.getElementById("result-content");
  if (content) content.classList.add("result-stale");
}

function hideStaleBanner() {
  var banner = document.getElementById("stale-banner");
  if (banner) banner.classList.remove("show");
  var content = document.getElementById("result-content");
  if (content) content.classList.remove("result-stale");
}
