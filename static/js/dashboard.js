/**
 * dashboard.js — loads live data from /api/health and /api/model-info
 * Renders: stats strip, confusion matrix, metric comparison bars.
 */
"use strict";

var setText = window.VehicleCare.setText;

document.addEventListener("DOMContentLoaded", function () {
  loadDashboard();
});

async function loadDashboard() {
  try {
    var [healthRes, infoRes] = await Promise.all([
      fetch("/api/health"),
      fetch("/api/model-info")
    ]);
    var health = await healthRes.json();
    var info   = await infoRes.json();

    renderStats(health, info);
    renderCharts(info);
  } catch (err) {
    renderStats(null, null);
    renderError("charts-area", "Could not load evaluation data.");
  }
}

function renderStats(health, info) {
  /* API status */
  var apiEl = document.getElementById("stat-api");
  if (apiEl) {
    apiEl.innerHTML = "";
    if (!health) {
      var s = document.createElement("span");
      s.textContent = "Unavailable";
      s.style.color = "var(--color-destructive)";
      s.style.fontSize = "14px";
      apiEl.appendChild(s);
    } else {
      var badge = document.createElement("span");
      badge.className = "badge badge-success";
      badge.textContent = health.status === "ok" ? "Online" : "Degraded";
      apiEl.appendChild(badge);
    }
  }

  /* Model availability */
  var modelEl = document.getElementById("stat-model");
  if (modelEl) {
    modelEl.innerHTML = "";
    if (!health) {
      var s2 = document.createElement("span");
      s2.textContent = "Unavailable";
      s2.style.fontSize = "14px";
      s2.style.color = "var(--color-muted-fg)";
      modelEl.appendChild(s2);
    } else if (health.model_loaded) {
      var b2 = document.createElement("span");
      b2.className = "badge badge-success";
      b2.textContent = "Loaded";
      modelEl.appendChild(b2);
    } else {
      var b3 = document.createElement("span");
      b3.className = "badge badge-warn";
      b3.textContent = "Not trained";
      modelEl.appendChild(b3);
    }
  }

  /* Algorithm name */
  var algoEl = document.getElementById("stat-algo");
  if (algoEl) {
    algoEl.innerHTML = "";
    var algoName = (info && info.model_name) ? info.model_name : "Unavailable";
    algoEl.textContent = algoName;
    if (!info || !info.model_name) algoEl.style.color = "var(--color-muted-fg)";
  }
}

function renderCharts(info) {
  var em = info && info.evaluation_metrics;
  if (!em || !Array.isArray(em.models) || em.models.length === 0) {
    renderError("cm-container", "Evaluation metrics not available.");
    renderError("metric-bars-container", "Evaluation metrics not available.");
    return;
  }

  var rf    = em.models.find(function (m) { return m.model === "RandomForestClassifier"; });
  var dummy = em.models.find(function (m) { return m.model && m.model.toLowerCase().includes("dummy"); });

  if (rf && rf.confusion_matrix) {
    renderConfusionMatrix("cm-container", rf.confusion_matrix);
  } else {
    renderError("cm-container", "Confusion matrix not available.");
  }

  if (rf) {
    renderMetricBars("metric-bars-container", rf, dummy);
    var legend = document.getElementById("metric-legend");
    if (legend) legend.style.display = dummy ? "flex" : "none";
  } else {
    renderError("metric-bars-container", "Metric data not available.");
  }
}

function renderConfusionMatrix(containerId, cm) {
  var el = document.getElementById(containerId);
  if (!el) return;

  var tn = cm.true_negative,  fp = cm.false_positive;
  var fn = cm.false_negative, tp = cm.true_positive;

  el.innerHTML = "";

  var grid = document.createElement("div");
  grid.className = "cm-grid";
  grid.setAttribute("aria-label", "Confusion matrix");

  /* Row 0: corner + predicted labels */
  appendCell(grid, "cm-label", "");
  appendCell(grid, "cm-label", "Pred: No Maint.");
  appendCell(grid, "cm-label", "Pred: Maint.");

  /* Row 1: Actual No Maint. */
  appendCell(grid, "cm-label", "Actual: No Maint.");
  appendConfCell(grid, "cm-cell cm-tn", tn, "True Neg.");
  appendConfCell(grid, "cm-cell cm-fp", fp, "False Pos.");

  /* Row 2: Actual Maint. */
  appendCell(grid, "cm-label", "Actual: Maint.");
  appendConfCell(grid, "cm-cell cm-fn", fn, "False Neg.");
  appendConfCell(grid, "cm-cell cm-tp", tp, "True Pos.");

  el.appendChild(grid);
}

function appendCell(parent, cls, text) {
  var d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  parent.appendChild(d);
}

function appendConfCell(parent, cls, value, label) {
  var d = document.createElement("div");
  d.className = cls;

  var num = document.createElement("span");
  num.className = "cm-cell-num";
  num.textContent = (value != null) ? String(value) : "—";

  var lbl = document.createElement("span");
  lbl.className = "cm-cell-lbl";
  lbl.textContent = label;

  d.appendChild(num);
  d.appendChild(lbl);
  parent.appendChild(d);
}

var METRIC_KEYS = [
  { key: "accuracy",  label: "Accuracy"  },
  { key: "precision", label: "Precision" },
  { key: "recall",    label: "Recall"    },
  { key: "f1_score",  label: "F1 Score"  },
  { key: "roc_auc",   label: "ROC-AUC"   },
];

function renderMetricBars(containerId, rf, dummy) {
  var el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = "";

  var wrap = document.createElement("div");
  wrap.className = "metric-bars";

  METRIC_KEYS.forEach(function (m) {
    var rfVal    = rf[m.key] != null ? rf[m.key] : null;
    var dummyVal = dummy && dummy[m.key] != null ? dummy[m.key] : null;

    var row = document.createElement("div");
    row.className = "metric-bar-row";

    var lbl = document.createElement("div");
    lbl.className = "metric-bar-label";
    lbl.textContent = m.label;

    var track = document.createElement("div");
    track.className = "metric-bar-track";

    if (rfVal !== null) {
      var rfBar = document.createElement("div");
      rfBar.className = "metric-bar-rf";
      rfBar.style.width = (rfVal * 100).toFixed(1) + "%";
      track.appendChild(rfBar);
    }

    if (dummyVal !== null) {
      var dBar = document.createElement("div");
      dBar.className = "metric-bar-dummy";
      dBar.style.width = (dummyVal * 100).toFixed(1) + "%";
      track.appendChild(dBar);
    }

    var vals = document.createElement("div");
    vals.className = "metric-bar-vals";
    if (rfVal !== null) {
      var strong = document.createElement("strong");
      strong.textContent = (rfVal * 100).toFixed(1) + "%";
      vals.appendChild(strong);
      if (dummyVal !== null) {
        var span = document.createElement("span");
        span.textContent = " / " + (dummyVal * 100).toFixed(1) + "%";
        vals.appendChild(span);
      }
    } else {
      vals.textContent = "N/A";
    }

    row.appendChild(lbl);
    row.appendChild(track);
    row.appendChild(vals);
    wrap.appendChild(row);
  });

  el.appendChild(wrap);
}

function renderError(containerId, message) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  var p = document.createElement("p");
  p.style.cssText = "font-size:12px;color:var(--color-muted-fg);padding:16px 0;";
  p.textContent = message;
  el.appendChild(p);
}
