/**
 * performance.js — Model Performance page
 * Loads actual evaluation data from /api/model-info and renders:
 *   - RF metric cells, confusion matrix, metric bars, baseline table
 */
"use strict";

var METRIC_KEYS = [
  { key: "accuracy",  label: "Accuracy"  },
  { key: "precision", label: "Precision" },
  { key: "recall",    label: "Recall"    },
  { key: "f1_score",  label: "F1 Score"  },
  { key: "roc_auc",   label: "ROC-AUC"   },
];

document.addEventListener("DOMContentLoaded", function () {
  loadPerformance();
});

async function loadPerformance() {
  try {
    var res  = await fetch("/api/model-info");
    var data = await res.json();
    render(data);
  } catch (_) {
    renderUnavailable();
  }
}

function render(info) {
  var em = info && info.evaluation_metrics;

  /* Top badge */
  var badge = document.getElementById("perf-data-badge");
  if (badge) {
    if (em) {
      badge.className  = "badge badge-success";
      badge.textContent = "Evaluation data loaded";
    } else {
      badge.className  = "badge badge-warn";
      badge.textContent = "Metrics unavailable";
    }
  }

  if (!em || !Array.isArray(em.models) || em.models.length === 0) {
    renderUnavailable();
    return;
  }

  var rf    = em.models.find(function (m) { return m.model === "RandomForestClassifier"; });
  var dummy = em.models.find(function (m) { return m.model && m.model.toLowerCase().includes("dummy"); });

  /* RF metric cells */
  var IDS = { accuracy: "rf-accuracy", precision: "rf-precision", recall: "rf-recall", f1_score: "rf-f1", roc_auc: "rf-auc" };
  Object.entries(IDS).forEach(function ([k, id]) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = "";
    var val = rf && rf[k] != null ? rf[k] : null;
    el.textContent = val != null ? (val * 100).toFixed(1) + "%" : "Unavailable";
    if (dummy && dummy[k] != null) {
      var base = document.createElement("p");
      base.className = "perf-metric-base";
      base.textContent = "Baseline: " + (dummy[k] * 100).toFixed(1) + "%";
      el.insertAdjacentElement("afterend", base);
    }
  });

  /* Confusion matrix */
  if (rf && rf.confusion_matrix) {
    renderCM("cm-perf", rf.confusion_matrix);
  } else {
    renderError("cm-perf", "Confusion matrix data not available.");
  }

  /* Metric comparison bars */
  if (rf) {
    renderBars("perf-bars", rf, dummy);
    var legend = document.getElementById("perf-legend");
    if (legend) legend.style.display = "flex";
  } else {
    renderError("perf-bars", "Metric data not available.");
  }

  /* Baseline comparison table */
  if (rf || dummy) {
    renderBaselineTable("baseline-table-wrap", rf, dummy);
  }

  /* Split info */
  var si = document.getElementById("split-info");
  if (si && em.train_size) {
    document.getElementById("split-train").textContent = em.train_size;
    document.getElementById("split-test").textContent  = em.test_size;
    si.style.display = "block";
  }
}

function renderCM(containerId, cm) {
  var el = document.getElementById(containerId);
  if (!el) return;

  var tn = cm.true_negative,  fp = cm.false_positive;
  var fn = cm.false_negative, tp = cm.true_positive;

  el.innerHTML = "";

  var grid = document.createElement("div");
  grid.className = "cm-grid";
  grid.setAttribute("aria-label", "Confusion matrix");

  appendCell(grid, "cm-label", "");
  appendCell(grid, "cm-label", "Pred: No Maint.");
  appendCell(grid, "cm-label", "Pred: Maint.");

  appendCell(grid, "cm-label", "Actual: No Maint.");
  appendConfCell(grid, "cm-cell cm-tn", tn, "True Neg.");
  appendConfCell(grid, "cm-cell cm-fp", fp, "False Pos.");

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
  num.textContent = value != null ? String(value) : "—";
  var lbl = document.createElement("span");
  lbl.className = "cm-cell-lbl";
  lbl.textContent = label;
  d.appendChild(num);
  d.appendChild(lbl);
  parent.appendChild(d);
}

function renderBars(containerId, rf, dummy) {
  var el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = "";
  var wrap = document.createElement("div");
  wrap.className = "metric-bars";

  METRIC_KEYS.forEach(function (m) {
    var rfVal    = rf && rf[m.key] != null    ? rf[m.key]    : null;
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
        vals.appendChild(document.createTextNode(" / " + (dummyVal * 100).toFixed(1) + "%"));
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

function renderBaselineTable(containerId, rf, dummy) {
  var wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = "";

  var div = document.createElement("div");
  div.className = "table-wrap";

  var table = document.createElement("table");
  table.className = "data-table";
  table.setAttribute("aria-label", "Model vs baseline comparison");

  /* Head */
  var thead = document.createElement("thead");
  var headRow = document.createElement("tr");
  ["Metric", "RandomForestClassifier", "DummyClassifier (baseline)", "Difference"].forEach(function (h) {
    var th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  /* Body */
  var tbody = document.createElement("tbody");
  METRIC_KEYS.forEach(function (m) {
    var rfVal    = rf    && rf[m.key]    != null ? rf[m.key]    : null;
    var dummyVal = dummy && dummy[m.key] != null ? dummy[m.key] : null;

    var tr = document.createElement("tr");

    tdText(tr, m.label);
    tdText(tr, rfVal    != null ? (rfVal * 100).toFixed(1)    + "%" : "N/A");
    tdText(tr, dummyVal != null ? (dummyVal * 100).toFixed(1) + "%" : "N/A");

    /* Difference */
    var diffTd = document.createElement("td");
    if (rfVal !== null && dummyVal !== null) {
      var diff = ((rfVal - dummyVal) * 100);
      diffTd.textContent = (diff >= 0 ? "+" : "") + diff.toFixed(1) + "%";
      diffTd.style.color = diff >= 0 ? "var(--color-success)" : "var(--color-destructive)";
      diffTd.style.fontWeight = "500";
    } else {
      diffTd.textContent = "—";
    }
    tr.appendChild(diffTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  div.appendChild(table);
  wrap.appendChild(div);
}

function tdText(tr, text) {
  var td = document.createElement("td");
  td.textContent = text;
  tr.appendChild(td);
}

function renderError(containerId, msg) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = "";
  var p = document.createElement("p");
  p.style.cssText = "font-size:12px;color:var(--color-muted-fg);padding:16px 0;";
  p.textContent = msg;
  el.appendChild(p);
}

function renderUnavailable() {
  var badge = document.getElementById("perf-data-badge");
  if (badge) { badge.className = "badge badge-warn"; badge.textContent = "Metrics unavailable"; }

  ["rf-accuracy","rf-precision","rf-recall","rf-f1","rf-auc"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.innerHTML = ""; el.textContent = "Unavailable"; el.style.color = "var(--color-muted-fg)"; el.style.fontSize = "14px"; }
  });

  renderError("cm-perf", "Could not load evaluation data.");
  renderError("perf-bars", "Could not load evaluation data.");
  renderError("baseline-table-wrap", "Could not load evaluation data.");
}
