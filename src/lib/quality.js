// Client Quality KPI — pure calculation (no UI, no network).
//
// Rule (as agreed with Mohamed Saeed):
//   success rate of a customer in a month = (delivered + rejected-with-shipping-paid) / all shipments of that month
//   For a measured month M, take the 3 calendar months before it. A customer is INCLUDED only if it has shipments
//   in all 3 of those months AND in M. Baseline = average success rate of the 3 previous months; current = rate of M.
//   delta (percentage points) = current - baseline:
//        >= 7  ممتاز        >= 5  المطلوب        >= 3  مقبول        otherwise  غير مقبول
//
// Input row shape (from Apps Script action=clientMonthly):  { n: "customer", v: { October: [total, delivered, paid], ... } }

export const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTH_AR = {
  January: 'يناير', February: 'فبراير', March: 'مارس', April: 'أبريل', May: 'مايو', June: 'يونيو',
  July: 'يوليو', August: 'أغسطس', September: 'سبتمبر', October: 'أكتوبر', November: 'نوفمبر', December: 'ديسمبر',
};

export const HISTORY_MONTHS = 3;
// First Attempt and Branch SLA: same customers as «نسبة التسليم», but the baseline is this single month (not the 3-month average).
export const BASELINE_MONTH = 'October';

export function makeLevels({ excellent, required, acceptable }) {
  return [
    { key: 'excellent', label: 'ممتاز', minDelta: excellent },
    { key: 'required', label: 'المطلوب', minDelta: required },
    { key: 'acceptable', label: 'مقبول', minDelta: acceptable },
    { key: 'below', label: 'غير مقبول', minDelta: -Infinity },
  ];
}

// A KPI = which shipments count as a success + the improvement (in percentage points) needed for each level.
// Customer cell = [total, delivered, rejected-with-shipping-paid, delivered-on-first-attempt].
export const METRICS = {
  delivery: {
    id: 'delivery',
    label: 'نسبة التسليم',
    avgLabel: 'متوسط التسليمات',
    description: 'متوسط التسليمات (تسليم + رفض الاستلام مع دفع الشحن) مقارنة بمتوسط آخر 3 شهور للعملاء المكررين',
    successDescription: 'التسليم + رفض الاستلام مع دفع الشحن',
    levels: makeLevels({ acceptable: 3, required: 5, excellent: 7 }),
    success: (c) => (c ? c[1] + c[2] : 0),
    successText: (g) => `${g.curDelivered.toLocaleString('en-US')} تسليم + ${g.curPaid.toLocaleString('en-US')} دفع شحن من ${g.curTotal.toLocaleString('en-US')} شحنة`,
    available: () => true,
  },
  firstAttempt: {
    id: 'firstAttempt',
    label: 'First Attempt',
    avgLabel: 'نسبة First Attempt',
    description: 'التسليم من أول محاولة (بدون أي رفض) لنفس عملاء نسبة التسليم، مقارنة بشهر أكتوبر (الأساس)',
    baseMonth: BASELINE_MONTH, // single baseline month instead of the 3 previous months
    successDescription: 'التسليم من أول محاولة',
    levels: makeLevels({ acceptable: 3, required: 6, excellent: 10 }),
    success: (c) => (c ? c[3] || 0 : 0),
    successText: (g) => `${g.curSuccess.toLocaleString('en-US')} تسليم من أول محاولة من ${g.curTotal.toLocaleString('en-US')} شحنة`,
    // the 4th value only exists when the Apps Script is the version that returns first-attempt counts
    available: (clients) => clients.some((c) => Object.values(c.v).some((cell) => cell.length > 3)),
  },
};

export const LEVELS = METRICS.delivery.levels; // kept for callers that only need the default (delivery) levels

export function levelFor(deltaPoints, levels = LEVELS) {
  if (deltaPoints === null || deltaPoints === undefined || Number.isNaN(deltaPoints)) return null;
  // tiny tolerance so floating-point noise (e.g. 5.9999999999 for an exact +6) never drops a customer a level
  for (const l of levels) if (deltaPoints + 1e-9 >= l.minDelta) return l;
  return levels[levels.length - 1];
}

export function thresholdsText(metric) {
  const [ex, rq, ac] = metric.levels;
  return `${ac.label} ≥ +${ac.minDelta} · ${rq.label} ≥ +${rq.minDelta} · ${ex.label} ≥ +${ex.minDelta}`;
}

/** The `HISTORY_MONTHS` calendar months immediately before `month` (oldest first), or null when the year start is hit. */
export function previousMonths(month, count = HISTORY_MONTHS) {
  const i = MONTH_ORDER.indexOf(month);
  if (i - count < 0) return null;
  return MONTH_ORDER.slice(i - count, i);
}

const tot = (cell) => (cell ? cell[0] : 0);
const rate = (success, total) => (total > 0 ? (success / total) * 100 : null);

/**
 * method:
 *   'pooled' (default) — baseline = sum(success over the 3 months) / sum(total over the 3 months)
 *   'mean'             — baseline = simple average of the 3 monthly rates
 * minShipments — a customer needs at least this many shipments in EACH of the 4 months to be included (default 1).
 */
export function evaluateMonth(clients, month, { method = 'pooled', minShipments = 1, metric = METRICS.delivery, eligibleFor = null } = {}) {
  const ok = metric.success;
  // metric.baseMonth → baseline = that single month, and only the customers returned by eligibleFor(month) are measured.
  const base = metric.baseMonth || null;
  if (base && MONTH_ORDER.indexOf(month) <= MONTH_ORDER.indexOf(base)) {
    return { month, error: 'before-base', message: `الأساس شهر ${MONTH_AR[base]} — اختر شهرًا بعده.` };
  }
  const prev = base ? [base] : previousMonths(month);
  if (!prev) return { month, error: 'no-history', message: 'الشهر ده معندوش 3 شهور سابقة في نفس السنة.' };
  const only = base && eligibleFor ? eligibleFor(month) : null;
  const needed = [...prev, month];
  const min = Math.max(1, Number(minShipments) || 1);

  const rows = [];
  const excluded = { notInAllMonths: 0, belowMinimum: 0 };
  for (const c of clients) {
    if (only && !only.has(c.n)) continue;
    const cells = needed.map((m) => c.v[m]);
    const present = cells.every((cell) => tot(cell) > 0);
    if (!present) { if (cells.some((cell) => tot(cell) > 0)) excluded.notInAllMonths++; continue; }
    if (cells.some((cell) => tot(cell) < min)) { excluded.belowMinimum++; continue; }

    const histRates = prev.map((m) => rate(ok(c.v[m]), tot(c.v[m])));
    const histTotal = prev.reduce((s, m) => s + tot(c.v[m]), 0);
    const histSuccess = prev.reduce((s, m) => s + ok(c.v[m]), 0);
    const baseline = method === 'mean' ? histRates.reduce((s, r) => s + r, 0) / histRates.length : rate(histSuccess, histTotal);
    const cur = c.v[month];
    const current = rate(ok(cur), tot(cur));
    const delta = current - baseline;
    rows.push({
      name: c.n,
      monthlyRates: histRates, // aligned with `prev`
      baseline, current, delta,
      level: levelFor(delta, metric.levels),
      curTotal: tot(cur), curDelivered: cur[1], curPaid: cur[2], curSuccess: ok(cur),
      histTotal,
      _v: c.v,
    });
  }

  // Group result over the included customers.
  const sum = (months, f) => rows.reduce((s, r) => s + months.reduce((t, m) => t + f(r._v[m]), 0), 0);
  const monthRate = (m) => rate(sum([m], ok), sum([m], tot));
  const histMonthRates = prev.map(monthRate);
  const baseline = rows.length === 0 ? null
    : method === 'mean' ? histMonthRates.reduce((s, r) => s + r, 0) / histMonthRates.length
      : rate(sum(prev, ok), sum(prev, tot));
  const current = rows.length === 0 ? null : monthRate(month);
  const delta = baseline === null ? null : current - baseline;
  const levelCounts = Object.fromEntries(metric.levels.map((l) => [l.key, 0]));
  rows.forEach((r) => { levelCounts[r.level.key]++; });

  return {
    month, prev, method, minShipments: min, metric,
    group: {
      baseline, current, delta, level: levelFor(delta, metric.levels),
      histMonthRates, // aligned with `prev`
      customers: rows.length,
      curTotal: rows.reduce((s, r) => s + r.curTotal, 0),
      curDelivered: rows.reduce((s, r) => s + r.curDelivered, 0),
      curPaid: rows.reduce((s, r) => s + r.curPaid, 0),
      curSuccess: rows.reduce((s, r) => s + r.curSuccess, 0),
    },
    rows, excluded, levelCounts,
  };
}

/** Group result for every month that has its 3 previous months available — the month-by-month trend. */
export function evaluateAllMonths(clients, availableMonths, opts) {
  const have = new Set(availableMonths);
  const out = [];
  const base = opts?.metric?.baseMonth || null;
  for (const m of MONTH_ORDER) {
    const prev = base ? (MONTH_ORDER.indexOf(m) > MONTH_ORDER.indexOf(base) ? [base] : null) : previousMonths(m);
    if (!prev || !have.has(m) || !prev.every((p) => have.has(p))) continue;
    const r = evaluateMonth(clients, m, opts);
    if (!r.error) out.push({ month: m, ...r.group, excluded: r.excluded });
  }
  return out;
}

/**
 * Branch table. The set of customers is the SAME as the main KPI (present in the 3 previous months + the measured month).
 * For every branch we then take only those customers' shipments handled by that branch:
 *   average = pooled success rate over the 3 previous months, current = the measured month, delta in percentage points.
 * Needs the API response with withBranches=1:  branches = [names], client.b = { branchIndex: { month: [total, delivered, paid] } }.
 * Branch totals add up exactly to the group totals of evaluateMonth().
 */
export function evaluateBranches(clients, branches, evaluated) {
  if (!evaluated || evaluated.error || !branches) return [];
  const { prev, month, method, metric } = evaluated;
  const included = new Set(evaluated.rows.map((r) => r.name));
  const acc = new Map(); // branch index -> { cells: {month:[total,ok]}, customers:Set }
  for (const c of clients) {
    if (!included.has(c.n) || !c.b) continue;
    for (const [bi, months] of Object.entries(c.b)) {
      let a = acc.get(bi);
      if (!a) { a = { cells: {}, customers: new Set() }; acc.set(bi, a); }
      for (const m of [...prev, month]) {
        const cell = months[m];
        if (!cell) continue;
        const t = (a.cells[m] ||= [0, 0]);
        t[0] += cell[0]; t[1] += metric.success(cell);
        if (m === month && cell[0] > 0) a.customers.add(c.n);
      }
    }
  }
  const out = [];
  for (const [bi, a] of acc) {
    const monthRates = prev.map((m) => (a.cells[m] ? rate(a.cells[m][1], a.cells[m][0]) : null));
    const histTotal = prev.reduce((s, m) => s + (a.cells[m]?.[0] || 0), 0);
    const histOk = prev.reduce((s, m) => s + (a.cells[m]?.[1] || 0), 0);
    const cur = a.cells[month];
    if (!histTotal || !cur || !cur[0]) continue; // a branch needs shipments in the baseline and in the measured month
    let baseline;
    if (method === 'mean') {
      const valid = monthRates.filter((x) => x !== null);
      baseline = valid.reduce((s, x) => s + x, 0) / valid.length;
    } else baseline = rate(histOk, histTotal);
    const current = rate(cur[1], cur[0]);
    const delta = current - baseline;
    out.push({
      branch: branches[Number(bi)], customers: a.customers.size,
      histTotal, curTotal: cur[0], curSuccess: cur[1],
      baseline, current, delta, level: levelFor(delta, metric.levels),
    });
  }
  return out;
}

/**
 * What happened in ONE month (no comparison) — used for the baseline month (October) when no later month can be measured yet.
 * only = Set of customer names to include (the «نسبة التسليم» customers), or null for every customer with shipments that month.
 * Returns { month, customers, total, success, rate, rows (per customer), branchRows (per branch) }.
 */
export function monthSnapshot(clients, branches, metric, month, only = null) {
  const rows = [], br = new Map();
  let total = 0, success = 0;
  for (const c of clients) {
    if (only && !only.has(c.n)) continue;
    const cell = c.v[month];
    if (!tot(cell)) continue;
    const ok = metric.success(cell);
    rows.push({ name: c.n, total: cell[0], success: ok, rate: rate(ok, cell[0]) });
    total += cell[0]; success += ok;
    if (c.b && branches) {
      for (const [bi, months] of Object.entries(c.b)) {
        const bc = months[month];
        if (!bc || !bc[0]) continue;
        const a = br.get(bi) || { branch: branches[Number(bi)], customers: new Set(), total: 0, success: 0 };
        a.customers.add(c.n); a.total += bc[0]; a.success += metric.success(bc);
        br.set(bi, a);
      }
    }
  }
  const branchRows = [...br.values()].map((a) => ({ branch: a.branch, customers: a.customers.size, total: a.total, success: a.success, rate: rate(a.success, a.total) }));
  return { month, customers: rows.length, total, success, rate: rate(success, total), rows, branchRows };
}

/** Same idea for the delivery-days SLA: average delivery days per branch in one month (cell[4] = sum of days, cell[5] = delivered with a date). */
export function slaMonthSnapshot(clients, branches, month, only = null) {
  const br = new Map(), names = new Set();
  let days = 0, n = 0;
  for (const c of clients) {
    if (only && !only.has(c.n)) continue;
    if (!c.b || !branches) continue;
    for (const [bi, months] of Object.entries(c.b)) {
      const cell = months[month];
      if (!cell || cell.length < 6 || !cell[5]) continue;
      const a = br.get(bi) || { branch: branches[Number(bi)], customers: new Set(), days: 0, n: 0 };
      a.customers.add(c.n); a.days += cell[4]; a.n += cell[5];
      br.set(bi, a); days += cell[4]; n += cell[5]; names.add(c.n);
    }
  }
  const rows = [...br.values()].map((a) => ({ branch: a.branch, customers: a.customers.size, delivered: a.n, avg: a.days / a.n }));
  return { month, customers: names.size, delivered: n, avg: n ? days / n : null, rows };
}
