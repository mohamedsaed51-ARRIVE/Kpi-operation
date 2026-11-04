import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/saved-summaries.json', import.meta.url), 'utf8'));
const code = fs.readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8');

function load({ rows = fixture.rows, props = {} } = {}) {
  const writes = []; // anything that would modify a spreadsheet ends up here — must stay empty
  const store = { ...props };
  const sheetFor = (month) => ({
    getLastRow: () => (rows[month] ? rows[month].length + 1 : 1),
    getRange: () => ({ getValues: () => rows[month] || [], setValues: (v) => writes.push(['setValues', v]) }),
    insertSheet: () => writes.push(['insertSheet']),
  });
  // each quarter file holds its months' rows in one DASHBOARD_SUMMARY tab
  const quarterRows = (qMonths) => qMonths.flatMap((m) => rows[m] || []);
  const Q = { 'Q1': [], 'Q2': [], 'Q3': ['July', 'August', 'September'], 'Q4': ['October'] };
  const sb = {
    console, Date, Math, JSON, Object, Number, String, isFinite, Array,
    SpreadsheetApp: {
      openById: (id) => {
        const key = { '1_JaWfM199wOhRw2-7znStlvw9R2hENWg8s-6Dc_zYWU': 'Q1', '1auCRCzBQcO-ej4JeoEyYzhfBiGtlBb9WdM4iCbNNxkA': 'Q2', '1FUCWpI3DvJ6FRiEJ7eR6wNIn6iLIcJ_PSBBgxT74jJo': 'Q3', '1EosPPKKZ549a6cEGcF_7sCuG9W_ZQmbi6s0MQgehdTs': 'Q4' }[id];
        if (!key) throw new Error('unknown spreadsheet');
        const all = quarterRows(Q[key]);
        return {
          getSheetByName: (n) => (n === 'DASHBOARD_SUMMARY' && all.length ? { getLastRow: () => all.length + 1, getRange: () => ({ getValues: () => all, setValues: (v) => writes.push(['setValues', v]) }) } : null),
          insertSheet: () => writes.push(['insertSheet']),
        };
      },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => store[k] ?? null, setProperty: (k, v) => { store[k] = v; } }) },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }), MimeType: { TEXT: 'TEXT' } },
  };
  vm.createContext(sb); vm.runInContext(code, sb);
  return { sb, writes, store };
}

test('reproduces exactly what the operations dashboard code computed from the same saved summaries', () => {
  const { sb } = load();
  const got = JSON.parse(JSON.stringify(sb.getClientMonthlyPayload({})));
  delete got.durationMs;
  // the first four values of every cell are what the operations dashboard's code produced; the SLA values are checked below
  const first4 = (cells) => Object.fromEntries(Object.entries(cells).map(([m, c]) => [m, c.slice(0, 4)]));
  const strip = (p) => ({ ...p, clients: p.clients.map((c) => ({ n: c.n, v: first4(c.v), b: Object.fromEntries(Object.entries(c.b).map(([bi, ms]) => [bi, first4(ms)])) })) });
  assert.deepEqual(strip(got), strip(fixture.expected));
});

test('SLA values reproduce the operations dashboard\'s own «متوسط مدة التسليم» (customers and branches)', () => {
  const { sb } = load();
  const got = JSON.parse(JSON.stringify(sb.getClientMonthlyPayload({})));
  let checked = 0;
  for (const month of got.months) {
    const snap = JSON.parse(fixture.rows[month].map((r) => r[7]).join(''));
    // per branch: sum of days / delivered-with-date across all customers must equal the dashboard's branch avgDays
    got.branches.forEach((bn, bi) => {
      let days = 0, n = 0;
      got.clients.forEach((c) => { const cell = c.b[bi] && c.b[bi][month]; if (cell) { days += cell[4]; n += cell[5]; } });
      const ref = snap.branchSummary.find((b) => b.name === bn);
      assert.ok(ref, bn);
      assert.ok(ref.avgDays === null ? n === 0 : Math.abs(days / n - ref.avgDays) < 0.005, `${month} ${bn}: ${days / n} vs ${ref.avgDays}`);
      checked++;
    });
    // per customer likewise
    got.clients.forEach((c) => {
      const cell = c.v[month]; if (!cell) return;
      const ref = snap.customerSummary.find((x) => x.name === c.n);
      assert.ok(ref.avgDays === null ? cell[5] === 0 : Math.abs(cell[4] / cell[5] - ref.avgDays) < 0.005, `${month} ${c.n}`);
      checked++;
    });
  }
  assert.ok(checked > 20);
});

test('never writes to or creates anything in the spreadsheets', () => {
  const { sb, writes } = load();
  sb.getClientMonthlyPayload({});
  sb.doGet({ parameter: { action: 'clientMonthly' } });
  assert.deepEqual(writes, []);
});

test('months without a saved summary are reported, not guessed', () => {
  const { sb } = load();
  const r = JSON.parse(JSON.stringify(sb.getClientMonthlyPayload({})));
  assert.deepEqual(r.months, ['July', 'August', 'September', 'October']);
  assert.equal(r.missingMonths.length, 8);
  const one = JSON.parse(JSON.stringify(sb.getClientMonthlyPayload({ months: 'October' })));
  assert.deepEqual(one.months, ['October']);
});

test('a corrupted / incomplete summary is treated as missing', () => {
  const broken = { ...fixture.rows, October: fixture.rows.October.map((r) => [...r.slice(0, 6), 5, ...r.slice(7)]) }; // chunk count says 5 but only 1 row
  const { sb } = load({ rows: broken });
  const r = sb.getClientMonthlyPayload({});
  assert.ok(r.missingMonths.includes('October'));
});

test('classification: paid-shipping rejection is a success, refused-and-not-paid is not', () => {
  const { sb } = load();
  const cls = Object.fromEntries(JSON.parse(JSON.stringify(sb.getClientMonthlyPayload({}))).statusClassification.map((s) => [s.status.replace('رفض (الحالة النهائية): ', ''), s.cls]));
  assert.equal(cls['رفض الاستلام و تم دفع الشحن'], 'paid');
  assert.equal(cls['رفض الاستلام و رفض والدفع'], 'rejectedOther');
  assert.equal(cls['تسليم ناجح'], 'delivered');
});

test('targets: validated, stored in this project, and read back', () => {
  const { sb, store } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(sb.getKpiTargetsPayload().targets)), { delivery: {}, firstAttempt: {}, sla: {} });
  const s = sb.saveKpiTargetsPayload({ targets: JSON.stringify({ delivery: { 'فرع طنطا': 92, a: 150, b: -1, c: '', d: 'x' }, firstAttempt: { 'فرع طنطا': '45.5' }, sla: { 'فرع طنطا': '2.25', big: 61, neg: -1 }, other: { z: 1 } }) });
  assert.equal(s.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(s.targets)), { delivery: { 'فرع طنطا': 92 }, firstAttempt: { 'فرع طنطا': 45.5 }, sla: { 'فرع طنطا': 2.25 } }); // sla is in days (max 60), the others are percentages (max 100)
  assert.ok(store.KPI_TARGETS_JSON);
  assert.equal(sb.saveKpiTargetsPayload({ targets: '{bad' }).success, false);
  assert.equal(JSON.parse(JSON.stringify(sb.getKpiTargetsPayload().targets)).delivery['فرع طنطا'], 92); // unchanged after a failed save
});

test('doGet routes actions and answers ping', () => {
  const { sb } = load();
  assert.equal(JSON.parse(sb.doGet({ parameter: { action: 'ping' } }).text).success, true);
  assert.equal(JSON.parse(sb.doGet({ parameter: { action: 'nope' } }).text).success, false);
});

test('tiers: validated, stored in this project, blank numbers kept as null, bad JSON rejected', () => {
  const { sb, store } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(sb.getKpiTiersPayload().tiers)), []);
  const s = sb.saveKpiTiersPayload({ tiers: JSON.stringify([{ name: ' كبار ', minShipments: 500, weight: 40 }, { name: 'كبار', weight: 5 }, { name: 'صغار', minShipments: '', weight: '' }, { name: 'x', minShipments: 1.5, weight: 101 }, { name: '' }]) });
  assert.equal(s.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(s.tiers)), [{ name: 'كبار', minShipments: 500, weight: 40 }, { name: 'صغار', minShipments: null, weight: null }, { name: 'x', minShipments: null, weight: null }]);
  assert.ok(store.KPI_TIERS_JSON);
  assert.equal(sb.saveKpiTiersPayload({ tiers: '{bad' }).success, false);
  assert.equal(JSON.parse(JSON.stringify(sb.getKpiTiersPayload().tiers)).length, 3); // unchanged after a failed save
});
