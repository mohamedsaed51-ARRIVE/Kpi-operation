// Deterministic SAMPLE data — only used with ?demo=1 to preview the layout. NOT real ARRIVE data.
const MONTHS = ['July', 'August', 'September', 'October', 'November'];
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
const BRANCHES = ['القاهرة', 'الجيزة', 'الإسكندرية', 'المنصورة', 'طنطا', 'أسيوط'];
export function demoData() {
  const r = rng(7);
  const clients = [];
  for (let i = 1; i <= 60; i++) {
    const v = {};
    const base = 0.68 + r() * 0.22, size = Math.round(20 + r() * 400), lift = (r() - 0.35) * 0.12;
    const present = r() < 0.85 ? MONTHS : MONTHS.slice(1 + Math.floor(r() * 2));
    present.forEach((m, k) => {
      const t = Math.max(5, Math.round(size * (0.8 + r() * 0.4)));
      const p = Math.min(0.98, base + (k === 4 ? lift : 0) + (r() - 0.5) * 0.04);
      const ok = Math.round(t * p), paid = Math.round(ok * 0.05);
      const first = Math.round((ok - paid) * (0.45 + (k === 4 ? lift * 1.5 : 0) + (r() - 0.5) * 0.06));
      const deliv = ok - paid, days = 2.2 + (r() - 0.5) * 0.6 - (k === 4 ? lift * 2 : 0); // average delivery days (faster in the measured month when the customer improved)
      v[m] = [t, deliv, paid, Math.max(0, Math.min(deliv, first)), Math.round(deliv * days * 10) / 10, deliv];
    });
    // split every month's counts across 1-3 branches (the parts add up exactly to the customer's totals)
    const b = {}; const myBranches = [Math.floor(r() * 6), Math.floor(r() * 6), Math.floor(r() * 6)].filter((x, k, a) => a.indexOf(x) === k);
    Object.entries(v).forEach(([m, c]) => {
      let left = [...c];
      myBranches.forEach((bi, k) => {
        const last = k === myBranches.length - 1;
        const part = last ? left : left.map((x) => Math.round(x * (0.3 + r() * 0.3)));
        (b[bi] ||= {})[m] = part; left = left.map((x, j) => x - part[j]);
      });
    });
    clients.push({ n: `عميل تجريبي ${i}`, v, b });
  }
  return {
    success: true, branches: BRANCHES, months: MONTHS, missingMonths: [], skippedMonths: [], clients,
    statusClassification: [
      { status: 'تسليم ناجح', cls: 'delivered', count: 0 },
      { status: 'رفض (الحالة النهائية): رفض الاستلام و تم دفع الشحن', cls: 'paid', count: 0 },
      { status: 'رفض (الحالة النهائية): رفض الاستلام و رفض والدفع', cls: 'rejectedOther', count: 0 },
    ],
    paidKeywords: ['تم دفع الشحن'], demo: true,
  };
}

export function demoTargets() {
  return { delivery: { 'القاهرة': 85, 'الجيزة': 82 }, firstAttempt: { 'القاهرة': 40 }, sla: { 'القاهرة': 2.0, 'الجيزة': 2.0 } };
}

// Sample «SLA المرتجعات» rows (same compact shape as Code-SLA.gs) — demo only.
export function demoReturns() {
  const r = rng(11);
  const senders = Array.from({ length: 12 }, (_, i) => `راسل تجريبي ${i + 1}`);
  const branches = ['فرع رئيسى', 'الهرم', 'منصوره', 'طنطا', 'المعادى', 'فرع الشروق'];
  const rows = [];
  for (let i = 0; i < 400; i++) {
    const day = 1 + Math.floor(r() * 25), age = Math.floor(r() * 7);
    const close = `2026-09-${String(day).padStart(2, '0')}`;
    const ret = `2026-09-${String(Math.min(30, day + age)).padStart(2, '0')}`;
    rows.push([`9${100000 + i}`, Math.floor(r() * senders.length), `2026-09-${String(Math.max(1, day - 1)).padStart(2, '0')}`, 0, close, Math.floor(r() * branches.length), 0, ret, age, 0]);
  }
  return { ok: true, updatedAt: '2026-10-26T00:00:00.000Z', dict: { senders, statuses: ['في المخزن'], branches, finals: ['تم الارتجاع للراسل'], tabs: ['1-9'] }, rows };
}
