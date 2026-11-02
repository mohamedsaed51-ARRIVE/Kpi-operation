// Deterministic SAMPLE data — only used with ?demo=1 to preview the layout. NOT real ARRIVE data.
const MONTHS = ['July', 'August', 'September', 'October'];
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
      const p = Math.min(0.98, base + (k === 3 ? lift : 0) + (r() - 0.5) * 0.04);
      const ok = Math.round(t * p), paid = Math.round(ok * 0.05);
      const first = Math.round((ok - paid) * (0.45 + (k === 3 ? lift * 1.5 : 0) + (r() - 0.5) * 0.06));
      const deliv = ok - paid, days = 2.2 + (r() - 0.5) * 0.6 - (k === 3 ? lift * 2 : 0); // average delivery days (faster in the measured month when the customer improved)
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
  return { delivery: { 'القاهرة': 85, 'الجيزة': 82 }, firstAttempt: { 'القاهرة': 40 } };
}
