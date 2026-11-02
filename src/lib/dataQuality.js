import { MONTH_ORDER } from './quality.js';

/** Per-month coverage from the API response: how many customers / shipments each available month holds. */
export function monthCoverage(data) {
  const have = new Set(data.months);
  return MONTH_ORDER.map((month) => {
    if (!have.has(month)) return { month, available: false, customers: 0, total: 0, delivered: 0, paid: 0, first: 0 };
    let customers = 0, total = 0, delivered = 0, paid = 0, first = 0;
    for (const c of data.clients) {
      const cell = c.v[month];
      if (!cell || !(cell[0] > 0)) continue;
      customers++; total += cell[0]; delivered += cell[1]; paid += cell[2]; first += cell[3] || 0;
    }
    return { month, available: true, customers, total, delivered, paid, first };
  });
}

/** Customer names that still contain HTML entities (&amp; &#039; …) — a source-data problem, shown for correction. */
export function namesWithEntities(clients) {
  const re = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i;
  return clients.map((c) => c.n).filter((n) => re.test(n));
}

/** Same customer name appearing with different spacing/case (likely duplicates created at registration). */
export function similarNames(clients) {
  const key = (n) => n.toLowerCase().replace(/[\s\-_.]+/g, '');
  const groups = new Map();
  for (const c of clients) {
    const k = key(c.n);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c.n);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export function apiChecks(data, metrics) {
  return [
    { name: 'تفصيل الفروع في رد السيرفر', ok: Array.isArray(data.branches) && data.clients.some((c) => c.b), hint: 'يحتاج Code.gs المحدّث (withBranches)' },
    ...metrics.map((m) => ({ name: `بيانات ${m.label}`, ok: m.available(data.clients), hint: 'يحتاج Code.gs المحدّث' })),
  ];
}
