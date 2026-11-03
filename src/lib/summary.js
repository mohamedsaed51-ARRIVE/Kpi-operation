import { MONTH_AR } from './quality.js';

const p = (v) => `${v.toFixed(1)}%`;
const d = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

/** Plain-Arabic management summary built only from the calculated result (no assumptions beyond the stated rule). */
export function managementSummary(result, { topN = 5 } = {}) {
  if (!result || result.error || result.group.baseline === null) return '';
  const g = result.group, m = MONTH_AR[result.month], metric = result.metric;
  const prev = result.prev.map((x) => MONTH_AR[x]).join(' و');
  const lines = [];
  lines.push(`ملخص ${metric.label} — ${m}`);
  if (metric.baseMonth) {
    lines.push(`• نطاق القياس: ${g.customers} عميل (نفس عملاء نسبة التسليم) لديهم شحنات في ${prev} و${m}.`);
    lines.push(`• نسبة النجاح (${metric.successDescription}): ${p(g.current)} في ${m} مقابل ${p(g.baseline)} في ${prev} (شهر الأساس).`);
  } else {
    lines.push(`• نطاق القياس: ${g.customers} عميل مكرر (لديهم شحنات في ${prev} و${m})، واستُبعد ${result.excluded.notInAllMonths} عميل لعدم توافر الأشهر الأربعة.`);
    lines.push(`• نسبة النجاح (${metric.successDescription}): ${p(g.current)} في ${m} مقابل متوسط ${p(g.baseline)} في ${prev}.`);
  }
  lines.push(`• الفرق: ${d(g.delta)}% ← التقييم: ${g.level.label}.`);
  const lc = result.levelCounts;
  lines.push(`• توزيع العملاء: ممتاز ${lc.excellent} · المطلوب ${lc.required} · مقبول ${lc.acceptable} · غير مقبول ${lc.below}.`);
  const byDelta = [...result.rows].sort((a, b) => a.delta - b.delta);
  const worst = byDelta.slice(0, topN).filter((r) => r.delta < 0);
  if (worst.length) lines.push(`• أكبر تراجع عن الأساس: ${worst.map((r) => `${r.name} (${d(r.delta)})`).join('، ')}.`);
  const best = byDelta.slice(-topN).reverse().filter((r) => r.delta > 0);
  if (best.length) lines.push(`• أكبر تحسن: ${best.map((r) => `${r.name} (${d(r.delta)})`).join('، ')}.`);
  return lines.join('\n');
}
