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

// ---- مؤشرات كارت «المؤشرات الرئيسية» ----
const norm = (s) => str(s).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
/** شكوى «قيد التحقيق». */
export const isInvestigating = (r) => !!r.status && r.status.includes('التحقيق');
/** شكوى اتقبل فيها التعويض (الحالة فيها «قبول» من غير نفي/رفض). */
export const isAccepted = (r) => { const s = norm(r.status); return s.includes('قبول') && !/(لم|رفض|عدم)/.test(s); };
/** الجهة المتحملة = الشركة (بتطبيع أ/ا و ة/ه). */
export const isCompanyBearer = (r) => norm(r.bearer).includes('الشركه');
export const isLost = (r) => norm(r.classification).includes('مفقود');
export const isDamaged = (r) => /(تالف|تلف)/.test(norm(r.classification));

/** عدد وتعويض فئة (مفقود/تالف) من «تصنيف المشكلة». */
export function classStats(rows, pred) {
  const sel = rows.filter(pred);
  return { count: sel.length, amount: sumAmount(sel) };
}

/** كل مؤشرات الكارت لمجموعة صفوف. */
export function overviewStats(rows) {
  const total = rows.length;
  const accepted = rows.filter(isAccepted).length;
  const company = rows.filter(isCompanyBearer);
  return {
    total,
    open: rows.filter(isOpen).length,
    investigating: rows.filter(isInvestigating).length,
    accepted,
    acceptRate: total ? (accepted / total) * 100 : null,
    amount: sumAmount(rows),
    compensated: rows.filter((r) => (r.amount || 0) > 0).length,
    companyAmount: sumAmount(company),
    companyCount: company.filter((r) => (r.amount || 0) > 0).length,
    lost: classStats(rows, isLost),
    damaged: classStats(rows, isDamaged),
  };
}
