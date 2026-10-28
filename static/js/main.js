/**
 * main.js — shared across all pages
 * Handles: theme toggle (localStorage), mobile drawer
 */
"use strict";

/* ── Theme ─────────────────────────────────────────────────── */
(function () {
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
})();

document.addEventListener("DOMContentLoaded", function () {

  /* Theme toggles — there may be two (desktop sidebar + mobile drawer) */
  document.querySelectorAll("#theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var isDark = document.documentElement.classList.toggle("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
    });
  });

  /* Mobile drawer */
  var menuBtn      = document.getElementById("menu-btn");
  var drawer       = document.getElementById("drawer");
  var drawerOverlay = document.getElementById("drawer-overlay");

  function openDrawer() {
    drawer.classList.add("open");
    drawerOverlay.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    drawerOverlay.setAttribute("aria-hidden", "false");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    drawerOverlay.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawerOverlay.setAttribute("aria-hidden", "true");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
  }

  if (menuBtn) menuBtn.addEventListener("click", openDrawer);
  if (drawerOverlay) drawerOverlay.addEventListener("click", closeDrawer);

  /* Close drawer on nav link click */
  if (drawer) {
    drawer.querySelectorAll("[data-nav-link]").forEach(function (a) {
      a.addEventListener("click", closeDrawer);
    });
  }

  /* Close drawer on Escape */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });
});

/* ── Utility: announce to screen readers ─────────────────────── */
function announce(msg) {
  var el = document.getElementById("live-region");
  if (!el) return;
  el.textContent = "";
  setTimeout(function () { el.textContent = msg; }, 60);
}

/* ── Utility: safe textContent setter ───────────────────────── */
function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text != null ? String(text) : "";
}

/* Export for page scripts */
window.VehicleCare = { announce: announce, setText: setText };
