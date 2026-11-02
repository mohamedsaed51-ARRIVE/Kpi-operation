/**
 * KPI Operation — standalone Apps Script backend (its OWN project / Web App).
 *
 * It does NOT modify or depend on the operations dashboard's Apps Script project:
 *   - READ-ONLY on the existing spreadsheets: it only reads the saved monthly summaries that the operations
 *     dashboard already stores in each quarter file's "DASHBOARD_SUMMARY" tab. It never writes to, nor creates, any sheet.
 *   - Its own settings (branch targets) live in THIS project's Script Properties.
 *
 * Actions (GET):
 *   ?action=clientMonthly      per customer, per month, per branch counts
 *   ?action=getKpiTargets      branch targets
 *   ?action=saveKpiTargets&targets=<json>
 *   ?action=ping
 *
 * Deploy: Deploy ▸ New deployment ▸ Web app ▸ Execute as: Me ▸ Who has access: Anyone.
 * The first run asks for permission to read your spreadsheets (same Google account that owns them).
 */

var SPREADSHEET_IDS = {
  Q1: "1_JaWfM199wOhRw2-7znStlvw9R2hENWg8s-6Dc_zYWU",
  Q2: "1auCRCzBQcO-ej4JeoEyYzhfBiGtlBb9WdM4iCbNNxkA",
  Q3: "1FUCWpI3DvJ6FRiEJ7eR6wNIn6iLIcJ_PSBBgxT74jJo",
  Q4: "1EosPPKKZ549a6cEGcF_7sCuG9W_ZQmbi6s0MQgehdTs"
};
var MONTH_ORDER = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var MONTH_SOURCE = {
  January: "Q1", February: "Q1", March: "Q1", April: "Q2", May: "Q2", June: "Q2",
  July: "Q3", August: "Q3", September: "Q3", October: "Q4", November: "Q4", December: "Q4"
};

// The operations dashboard's saved summaries (read only).
var SUMMARY_SHEET = "DASHBOARD_SUMMARY";
var SUMMARY_VERSION = "2";

// Status rules (same meaning as the operations dashboard).
var DELIVERED_STATUSES = ["تسليم ناجح", "التسليم ناجح"];
var REJECT_LABEL_PREFIX = "رفض (الحالة النهائية): "; // saved label of a rejection (taken from the final-status column)
var PAID_KEYWORDS = ["تم دفع الشحن"];                // a rejection counts only when the shipping was paid
var TIME_BUDGET_MS = 240000;

var KPI_TARGETS_PROPERTY_KEY = "KPI_TARGETS_JSON";
var KPI_TARGET_METRICS = ["delivery", "firstAttempt"];

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || "ping";
  var result;
  try {
    if (action === "clientMonthly") result = getClientMonthlyPayload(params);
    else if (action === "getKpiTargets") result = getKpiTargetsPayload();
    else if (action === "saveKpiTargets") result = saveKpiTargetsPayload(params);
    else if (action === "ping") result = { success: true, service: "kpi-operation-backend", time: new Date().toISOString() };
    else result = { success: false, error: "Unknown action: " + action };
  } catch (err) {
    result = { success: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.TEXT);
}

// ---------- helpers ----------
function normAr_(value) {
  return String(value || "").trim().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ");
}
function normText_(value) { return String(value === null || value === undefined ? "" : value).trim().replace(/\s+/g, " "); }
function hasAny_(norm, list) {
  for (var i = 0; i < list.length; i++) if (norm.indexOf(normAr_(list[i])) !== -1) return true;
  return false;
}

/** delivered | paid (rejection + shipping paid) | rejectedOther | other */
function statusClass_(label) {
  var n = normAr_(label);
  if (!n) return "other";
  if (n.indexOf(normAr_(REJECT_LABEL_PREFIX)) === 0) return hasAny_(n, PAID_KEYWORDS) ? "paid" : "rejectedOther";
  for (var i = 0; i < DELIVERED_STATUSES.length; i++) if (n === normAr_(DELIVERED_STATUSES[i])) return "delivered";
  return "other";
}

/** Reads one month's saved summary. READ ONLY: returns null when anything is missing — never creates a sheet. */
function readSavedMonth_(month) {
  if (!MONTH_SOURCE.hasOwnProperty(month)) return null;
  var ss;
  try { ss = SpreadsheetApp.openById(SPREADSHEET_IDS[MONTH_SOURCE[month]]); } catch (e) { return null; }
  var sh = ss.getSheetByName(SUMMARY_SHEET);
  if (!sh) return null;
  var last = sh.getLastRow();
  if (last < 2) return null;
  var rows = sh.getRange(2, 1, last - 1, 9).getValues();
  var parts = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === month && String(rows[i][1] || "") === SUMMARY_VERSION) parts.push(rows[i]);
  }
  if (!parts.length) return null;
  parts.sort(function (a, b) { return Number(a[5]) - Number(b[5]); });
  var expected = Number(parts[0][6]) || 0;
  if (!expected || parts.length !== expected) return null;
  var json = "";
  for (var j = 0; j < parts.length; j++) {
    if (Number(parts[j][5]) !== j) return null;
    json += String(parts[j][7] || "");
  }
  try { return JSON.parse(json); } catch (e2) { return null; }
}

// ---------- clientMonthly ----------
// Customer cell = [total, delivered, rejected-with-shipping-paid, delivered-on-first-attempt].
// Branch detail: client.b = { branchIndex: { month: cell } } with the names in `branches`.
function getClientMonthlyPayload(params) {
  var t0 = new Date().getTime();
  var requested = MONTH_ORDER.slice();
  if (params && params.months) {
    var asked = String(params.months).split(",").map(function (s) { return s.trim(); });
    requested = MONTH_ORDER.filter(function (m) { return asked.indexOf(m) !== -1; });
  }
  var months = [], missing = [], skipped = [];
  var clients = {}, clientOrder = [], clientBranches = {};
  var branchList = [], branchIdx = {};
  var statusRows = {};
  for (var mi = 0; mi < requested.length; mi++) {
    var month = requested[mi];
    if (new Date().getTime() - t0 > TIME_BUDGET_MS) { skipped.push(month); continue; }
    var snap = readSavedMonth_(month);
    if (!snap || !snap.filterCube || !snap.filterCube.records || !snap.filterCube.dict) { missing.push(month); continue; }
    var dict = snap.filterCube.dict, records = snap.filterCube.records;
    var classes = dict.status.map(statusClass_);
    var perClient = {}, perClientBranch = {};
    for (var ri = 0; ri < records.length; ri++) {
      var rec = records[ri], n = rec[7], cls = classes[rec[4]];
      var name = dict.client[rec[3]];
      var v = perClient[name] || (perClient[name] = [0, 0, 0, 0]);
      v[0] += n;
      if (cls === "delivered") v[1] += n; else if (cls === "paid") v[2] += n;
      var isFirst = (cls === "delivered" && rec[5] === 0); // rec[5]: attempt category (0 = first attempt)
      if (isFirst) v[3] += n;

      var bn = dict.branch[rec[2]];
      var bi = branchIdx.hasOwnProperty(bn) ? branchIdx[bn] : (branchIdx[bn] = branchList.push(bn) - 1);
      var pb = perClientBranch[name] || (perClientBranch[name] = {});
      var pbv = pb[bi] || (pb[bi] = [0, 0, 0, 0]);
      pbv[0] += n;
      if (cls === "delivered") pbv[1] += n; else if (cls === "paid") pbv[2] += n;
      if (isFirst) pbv[3] += n;

      if (cls !== "other") {
        var label = dict.status[rec[4]];
        if (!statusRows[label]) statusRows[label] = { status: label, cls: cls, count: 0 };
        statusRows[label].count += n;
      }
    }
    months.push(month);
    Object.keys(perClient).forEach(function (nm) {
      if (!clients[nm]) { clients[nm] = {}; clientOrder.push(nm); }
      clients[nm][month] = perClient[nm];
    });
    Object.keys(perClientBranch).forEach(function (nm) {
      var cb = clientBranches[nm] || (clientBranches[nm] = {});
      Object.keys(perClientBranch[nm]).forEach(function (b) { (cb[b] || (cb[b] = {}))[month] = perClientBranch[nm][b]; });
    });
  }
  return {
    success: true,
    months: months, missingMonths: missing, skippedMonths: skipped,
    clients: clientOrder.map(function (nm) { return { n: nm, v: clients[nm], b: clientBranches[nm] || {} }; }),
    branches: branchList,
    statusClassification: Object.keys(statusRows).map(function (k) { return statusRows[k]; }).sort(function (a, b) { return b.count - a.count; }),
    paidKeywords: PAID_KEYWORDS,
    durationMs: new Date().getTime() - t0
  };
}

// ---------- branch targets ----------
// { delivery: { "<branch>": <percent> }, firstAttempt: { "<branch>": <percent> } } — a percentage between 0 and 100.
function readTargets_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(KPI_TARGETS_PROPERTY_KEY);
    var parsed = raw ? JSON.parse(raw) : {};
    var out = {};
    KPI_TARGET_METRICS.forEach(function (m) { out[m] = (parsed && parsed[m] && typeof parsed[m] === "object") ? parsed[m] : {}; });
    return out;
  } catch (e) {
    return { delivery: {}, firstAttempt: {} };
  }
}
function getKpiTargetsPayload() { return { success: true, targets: readTargets_() }; }
function saveKpiTargetsPayload(params) {
  try {
    var parsed = (params && params.targets) ? JSON.parse(params.targets) : {};
    var clean = {};
    KPI_TARGET_METRICS.forEach(function (m) {
      clean[m] = {};
      var src = (parsed && parsed[m]) || {};
      for (var b in src) {
        if (!Object.prototype.hasOwnProperty.call(src, b)) continue;
        var name = normText_(b), val = src[b];
        if (!name || val === null || val === undefined || val === "") continue;
        var n = Number(val);
        if (!isFinite(n) || n < 0 || n > 100) continue;
        clean[m][name] = n;
      }
    });
    PropertiesService.getScriptProperties().setProperty(KPI_TARGETS_PROPERTY_KEY, JSON.stringify(clean));
    return { success: true, targets: clean };
  } catch (e) {
    return { success: false, error: String(e && e.message ? e.message : e) };
  }
}
