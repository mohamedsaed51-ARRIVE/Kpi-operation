// الشكاوى والتعويضات: تجميع صفوف داش بورد الشكاوى (قراءة فقط) — نفس قواعد داش الشكاوى.
// الصف الخام مفاتيحه أسماء أعمدة الشيت بالعربي.
export const NO_BEARER = 'غير محدد';
export const ALL_MONTHS = 'all';
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return Number.isNaN(n) ? null : n;
}
export function normDate(v) {
  const s = str(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
}

/** صف خام (مفاتيح عربية) ← صف داخلي. يتجاهل الصفوف بدون رقم شكوى ويمنع تكرار الرقم (نفس منطق داش الشكاوى). */
export function decodeComplaints(rawRows) {
  const seen = new Set();
  const out = [];
  (Array.isArray(rawRows) ? rawRows : []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const id = str(r['رقم الشكوى']);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const date = normDate(r['تاريخ الأضافة']);
    const mIdx = /^\d{4}-\d{2}/.test(date) ? parseInt(date.slice(5, 7), 10) - 1 : -1;
    out.push({
      id,
      date,
      month: str(r['الشهر']) || (mIdx >= 0 ? MONTHS_AR[mIdx] : ''),
      branch: str(r['الفرع المتسبب']),
      type: str(r['نوع الشكوى']).replace('شكوى تخص ', ''),
      classification: str(r['تصنيف المشكلة']),
      status: str(r['حالة الشكوى الحاليه']),
      bearer: str(r['وظيفه المتحمل']),
      amount: toNum(r['مبلغ التعويض المستحق']),
      resultDate: normDate(r['تاريخ نتيجة التحقيق']),
      compDate: normDate(r['تاريخ التعويض']),
      review: str(r['نتيجه مراجعة التعويض']),
    });
  });
  return out;
}

export const monthsOf = (rows) => [...new Set(rows.map((r) => r.month).filter(Boolean))]
  .sort((a, b) => MONTHS_AR.indexOf(a) - MONTHS_AR.indexOf(b));
export const filterMonth = (rows, month) => (!month || month === ALL_MONTHS ? rows : rows.filter((r) => r.month === month));

const amountOf = (r) => (typeof r.amount === 'number' ? r.amount : 0);
export const sumAmount = (rows) => rows.reduce((s, r) => s + amountOf(r), 0);
export const isOpen = (r) => !!r.status && (r.status.includes('جارى') || r.status.includes('التحقيق'));

/** التعويضات المتحملة لكل جهة تحميل: الإجمالي، عدد الشكاوى، الحالات اللي فيها تعويض. الأعلى مبلغًا أولًا. */
export function bearerSummary(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const k = r.bearer || NO_BEARER;
    const o = m.get(k) || { bearer: k, amount: 0, complaints: 0, compensated: 0 };
    const a = amountOf(r);
    o.amount += a; o.complaints += 1; if (a > 0) o.compensated += 1;
    m.set(k, o);
  });
  return [...m.values()].sort((a, b) => b.amount - a.amount || b.complaints - a.complaints);
}

/** عدد الشكاوى حسب بُعد (type | branch | classification | status). الأكثر أولًا. */
export function countBy(rows, key) {
  const m = new Map();
  rows.forEach((r) => { const k = r[key] || 'غير محدد'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

export function csvText(headers, lines) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return `﻿${[headers.map(esc).join(','), ...lines.map((l) => l.map(esc).join(','))].join('\r\n')}`;
}

/** شهر أحدث شكوى (بتاريخ الإضافة) — يعتمد على التاريخ الكامل مش ترتيب الشهر في السنة. */
export function latestMonth(rows) {
  let best = null;
  rows.forEach((r) => { if (r.month && r.date && (!best || r.date > best.date)) best = r; });
  return best ? best.month : null;
}

// ---- مؤشرات كارت «المؤشرات الرئيسية» (نفس قواعد داش بورد الشكاوى) ----
export const ACCEPT_TARGET_PCT = 75;   // نسبة قبول التعويض من الحالات المحسومة (≥)
export const PENDING_TARGET_PCT = 20;  // قيد التحقيق من الإجمالي (≤)
export const RES_SLA_TARGET_DAYS = 4;  // SLA التحقيق: تاريخ نتيجة التحقيق − تاريخ الإضافة
export const COMP_SLA_TARGET_DAYS = 2; // SLA التعويض: تاريخ التعويض − تاريخ نتيجة التحقيق

const normAr = (v) => str(v).replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
const OPEN_REVIEW = ['مراجعة الشكاوي', 'رد الشكاوي', 'معلقة'].map(normAr);
const LOST = ['شحنه مفقوده', 'مرتجع مفقوده'].map(normAr);
const DAMAGED = ['شحنه هالكه'].map(normAr);

/** قيد التحقيق / جارى. */
export const isInvestigating = (r) => !!r.status && (r.status.includes('جارى') || r.status.includes('التحقيق'));
/** قرار التعويض من «حالة الشكوى»: الرفض له الأولوية، «التعويض مسبقا» خارج البسط والمقام. */
export const decisionOf = (r) => { const s = r.status || ''; if (s.includes('رفض')) return 'rejected'; if (s.includes('قبول')) return 'accepted'; return null; };
export const isAccepted = (r) => decisionOf(r) === 'accepted';
/** مفتوحة موسّعة: قيد التحقيق أو نتيجة مراجعة التعويض (مراجعة/رد الشكاوي، معلقة). */
export const isOpenExtended = (r) => isInvestigating(r) || OPEN_REVIEW.includes(normAr(r.review));
export const isCompanyBearer = (r) => normAr(r.bearer).replace(/ /g, '') === 'الشركه';
export const isLost = (r) => LOST.includes(normAr(r.classification));
export const isDamaged = (r) => DAMAGED.includes(normAr(r.classification));

const dayDiff = (to, from) => {
  if (!to || !from) return null;
  const a = new Date(to), b = new Date(from);
  return Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? null : Math.round((a - b) / 86400000);
};
/** التزام + متوسط أيام لسلسلة فروق أيام (الحالات ذات التاريخين فقط). */
function slaOf(vals, target) {
  const v = vals.filter((x) => typeof x === 'number');
  const ok = v.filter((x) => x <= target).length;
  return { count: v.length, pct: v.length ? (ok / v.length) * 100 : null, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
}

/** عدد وتعويض فئة (مفقود/تالف) من «تصنيف المشكلة». */
export function classStats(rows, pred) {
  const sel = rows.filter(pred);
  return { count: sel.length, amount: sumAmount(sel) };
}

/** كل مؤشرات الكارت لمجموعة صفوف. */
export function overviewStats(rows) {
  const total = rows.length;
  const accepted = rows.filter(isAccepted).length;
  const rejected = rows.filter((r) => decisionOf(r) === 'rejected').length;
  const company = rows.filter(isCompanyBearer);
  return {
    total,
    open: rows.filter(isOpenExtended).length,
    investigating: rows.filter(isInvestigating).length,
    accepted, rejected, decided: accepted + rejected,
    acceptRate: accepted + rejected ? (accepted / (accepted + rejected)) * 100 : null,
    resSla: slaOf(rows.map((r) => dayDiff(r.resultDate, r.date)), RES_SLA_TARGET_DAYS),
    compSla: slaOf(rows.map((r) => dayDiff(r.compDate, r.resultDate)), COMP_SLA_TARGET_DAYS),
    amount: sumAmount(rows),
    compensated: rows.filter((r) => (r.amount || 0) > 0).length,
    companyAmount: sumAmount(company),
    companyCount: company.filter((r) => (r.amount || 0) > 0).length,
    lost: classStats(rows, isLost),
    damaged: classStats(rows, isDamaged),
  };
}
