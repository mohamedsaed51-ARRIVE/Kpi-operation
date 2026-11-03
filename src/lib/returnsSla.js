// SLA المرتجعات — pure logic ported from the returns dashboard (arrive-returns-dashboard/sla.js).
// Source: Google Sheet «Sla RTO» (daily tabs d-m) through its own Apps Script Web App.
// Return age = return closing date − shipment closing date (days). Nothing in the source rows is modified; quality flags are labels only.

export const UNKNOWN = 'غير محدد بالمصدر';
const FINAL_OK = 'تم الارتجاع للراسل';

// Display-only unification of branch names (the original name is kept in the log).
const BR_NAMES = { 'رئيسي': 'الرئيسي', 'اسكندريه': 'الإسكندرية', 'طنطا': 'طنطا', 'حدائق': 'الحدائق', 'حدائققبه': 'حدائق القبة', 'عجوزه': 'العجوزة', 'موسسه': 'المؤسسة', 'منصوره': 'المنصورة', 'امنصوره': 'المنصورة', 'هرم': 'الهرم', 'شروق': 'الشروق', 'معادي': 'المعادي', 'زقازيق': 'الزقازيق', 'مدينهنصر': 'مدينة نصر', 'مصرالجديده': 'مصر الجديدة', 'اكتوبر': 'أكتوبر' };

export function normBranch(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s || s === FINAL_OK) return UNKNOWN;
  const k = s.replace(/^فرع\s+/, '').replace(/[ىي]/g, 'ي').replace(/[ةه]/g, 'ه').replace(/^ال/, '').replace(/\s/g, '');
  return BR_NAMES[k] || s.replace(/^فرع\s+/, '');
}
export const normStatus = (s) => String(s || '').replace(/^فى /, 'في ').trim() || UNKNOWN;

export const FLAGS = {
  'تاريخ_ناقص': ['تاريخ ناقص', 'تاريخ التقفيل أو تاريخ تقفيل المرتجع فاضي أو غير مقروء، فلا يُحسب له عمر'],
  'عمر_شاذ': ['عمر لا يطابق التواريخ', 'عمر الشيت يختلف عن (تاريخ تقفيل المرتجع − تاريخ التقفيل)، ولا يُعد فرق اليوم الواحد لنفس اليوم ملاحظة'],
  'فرع_غير_محدد': ['فرع غير محدد', 'خانة فرع المرتجع فاضية أو فيها حالة بدل الفرع'],
  'بيك_اب_فارغ': ['بيك أب فارغ', 'تاريخ استلام البيك أب غير مسجل'],
  'مكرر_في_تابات': ['بوليصة متكررة', 'نفس رقم البوليصة ظاهر في أكثر من صف (غالبًا في أكثر من تاب)'],
};

const utcDay = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const daysBetween = (a, b) => (a && b ? Math.round((utcDay(b) - utcDay(a)) / 864e5) : null);
const tabKey = (t) => { const m = String(t).match(/(\d+)-(\d+)/); return m ? +m[2] * 100 + +m[1] : 0; };

/** Decode the compact JSON of Code-SLA.gs ({dict, rows}) into row objects. */
export function decodeReturns(j) {
  const d = j.dict;
  const rows = j.rows.map((a, i) => {
    const r = { id: i, wb: a[0], sender: d.senders[a[1]] || UNKNOWN, pickup: a[2], statusRaw: d.statuses[a[3]], status: normStatus(d.statuses[a[3]]), close: a[4], branchRaw: d.branches[a[5]], branch: normBranch(d.branches[a[5]]), final: d.finals[a[6]] || UNKNOWN, ret: a[7], ageS: a[8], tab: d.tabs[a[9]] };
    r.ageC = daysBetween(r.close, r.ret);
    r.noDate = r.ageC == null;
    r.tk = tabKey(r.tab);
    return r;
  });
  const by = new Map();
  rows.forEach((r) => { if (!by.has(r.wb)) by.set(r.wb, []); by.get(r.wb).push(r); });
  by.forEach((list) => {
    list.sort((x, y) => (x.close || '').localeCompare(y.close || '') || x.tk - y.tk);
    list.forEach((r) => { r.isFirst = r === list[0]; r.isLast = r === list[list.length - 1]; r.nDup = list.length; });
  });
  rows.forEach((r) => {
    const f = [];
    if (r.noDate) f.push('تاريخ_ناقص');
    else if (r.ageS != null && r.ageS !== r.ageC && !(r.ageC === 0 && r.ageS === 1)) f.push('عمر_شاذ');
    if (r.branch === UNKNOWN) f.push('فرع_غير_محدد');
    if (!r.pickup) f.push('بيك_اب_فارغ');
    if (r.nDup > 1) f.push('مكرر_في_تابات');
    r.flags = f;
  });
  return rows;
}

/** Age used for a row. mode 'written' = the sheet's «عمر المرتجع» column, 'calc' = computed from the two dates. */
export const ageOf = (r, mode) => (r.noDate ? null : mode === 'calc' ? r.ageC : (r.ageS != null ? r.ageS : null));

const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** limit = SLA limit in days (null → no verdict). "within" = age <= limit. */
export function stats(rows, ageFn, limit = null) {
  const ages = [];
  for (const r of rows) { const a = ageFn(r); if (a != null) ages.push(a); }
  const within = limit == null ? null : ages.filter((a) => a <= limit).length;
  return {
    rows: rows.length, n: ages.length,
    avg: ages.length ? ages.reduce((s, x) => s + x, 0) / ages.length : null,
    med: median(ages), max: ages.length ? Math.max(...ages) : null,
    within, late: limit == null ? null : ages.length - within,
    rate: limit == null || !ages.length ? null : within / ages.length, ages,
  };
}

export function groupStats(rows, key, ageFn, limit) {
  const m = new Map();
  for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m].map(([k, v]) => ({ key: k, ...stats(v, ageFn, limit) }));
}

/** filters = { q, branches:Set, statuses:Set, senders:Set, from, to, dup:'all'|'last'|'first' } */
export function filterReturns(rows, f) {
  const q = (f.q || '').trim().toLowerCase();
  return rows.filter((r) =>
    (f.dup === 'all' || (f.dup === 'last' ? r.isLast : r.isFirst))
    && (!f.branches.size || f.branches.has(r.branch)) && (!f.statuses.size || f.statuses.has(r.status)) && (!f.senders.size || f.senders.has(r.sender))
    && (!f.from || (r.ret && r.ret >= f.from)) && (!f.to || (r.ret && r.ret <= f.to))
    && (!q || r.wb.toLowerCase().includes(q) || r.sender.toLowerCase().includes(q)));
}

export const AGE_BUCKETS = [['0-1', (a) => a <= 1], ['2', (a) => a === 2], ['3', (a) => a === 3], ['4-5', (a) => a >= 4 && a <= 5], ['6-7', (a) => a >= 6 && a <= 7], ['8-10', (a) => a >= 8 && a <= 10], ['11-15', (a) => a >= 11 && a <= 15], ['16+', (a) => a >= 16]];

// The SLA limit (days) is entered in Settings and stored with the other settings under a reserved key.
export const RETURNS_SLA_KEY = '__returns_sla_days';
export function returnsSlaLimit(targets) {
  const v = targets?.sla?.[RETURNS_SLA_KEY];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Comparison like the other KPIs, but WITHOUT the customers split: all return rows of the sheet (after the page filters).
//   month = calendar month of «تاريخ تقفيل المرتجع»; baseline = pooled average age of the 3 previous months (only the ones that have data — even a single month);
//   improvement (days) = baseline − current (a shorter return age is better) → level from the thresholds saved in Settings.
// ---------------------------------------------------------------------------------------------------------------
export const monthKeyOf = (r) => (r.ret ? r.ret.slice(0, 7) : null); // 'YYYY-MM'

export function previousMonthKeys(key, count = 3) {
  let y = +key.slice(0, 4), m = +key.slice(5, 7);
  const out = [];
  for (let i = 0; i < count; i++) { m -= 1; if (m === 0) { m = 12; y -= 1; } out.unshift(`${y}-${String(m).padStart(2, '0')}`); }
  return out;
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const monthLabel = (key) => `${AR_MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;

/** Sum of ages and count per month key (and per branch when byBranch). */
function monthSums(rows, ageFn) {
  const all = new Map(), br = new Map();
  for (const r of rows) {
    const k = monthKeyOf(r), a = ageFn(r);
    if (!k || a == null) continue;
    const g = all.get(k) || [0, 0]; g[0] += a; g[1] += 1; all.set(k, g);
    const bm = br.get(r.branch) || new Map();
    const c = bm.get(k) || [0, 0]; c[0] += a; c[1] += 1; bm.set(k, c); br.set(r.branch, bm);
  }
  return { all, br };
}

const pooled = (cells, keys) => {
  let s = 0, n = 0;
  for (const k of keys) { const c = cells.get(k); if (c) { s += c[0]; n += c[1]; } }
  return n ? { avg: s / n, n } : null;
};

/**
 * rows = return rows (already filtered, without any date filter); levels = makeLevels() thresholds (days).
 * Returns { month, prev, group, branches, available } where group = null when the baseline or the month has no aged returns.
 */
export function evaluateReturnsMonth(rows, month, ageFn, levels, levelFn) {
  const prev = previousMonthKeys(month);
  const { all, br } = monthSums(rows, ageFn);
  const build = (cells) => {
    const base = pooled(cells, prev), cur = pooled(cells, [month]);
    if (!base || !cur) return null;
    const improvement = base.avg - cur.avg;
    return { baseline: base.avg, current: cur.avg, improvement, level: levelFn(improvement, levels), nBase: base.n, nCur: cur.n, monthAvgs: prev.map((k) => pooled(cells, [k])?.avg ?? null) };
  };
  const group = build(all);
  const branches = [];
  for (const [branch, cells] of br) { const r = build(cells); if (r) branches.push({ branch, ...r }); }
  const usedPrev = prev.filter((k) => all.has(k));
  return { month, prev, usedPrev, group, branches, missingPrev: prev.filter((k) => !all.has(k)) };
}

/** Months that can be compared: they have aged returns and at least ONE of the 3 previous months has too (the baseline then uses the months that exist). */
export function comparableMonths(rows, ageFn) {
  const { all } = monthSums(rows, ageFn);
  const present = [...all.keys()].sort();
  return { present, comparable: present.filter((k) => previousMonthKeys(k).some((p) => all.has(p))) };
}
