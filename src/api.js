import { API_URL } from './config.js';

async function call(params) {
  if (!API_URL) throw new Error('رابط الـ Web App الجديد لسه ما اتضبطش. انشر backend/Code.gs كمشروع Apps Script مستقل وحط رابطه في VITE_API_URL.');
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}?${qs}`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`فشل الاتصال بالسيرفر (HTTP ${res.status})`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('الرد من السيرفر مش JSON — اتأكد إن الـ Deployment متاح للجميع (Anyone) وإنه آخر نسخة.'); }
  if (data.success === false) throw new Error(data.error || 'السيرفر رجّع خطأ');
  return data;
}

export async function fetchClientMonthly() {
  const data = await call({ action: 'clientMonthly' });
  if (!Array.isArray(data.clients)) throw new Error('الرد مش من الباك إند الجديد (مفيش clients). اتأكد من الرابط.');
  return data;
}
export const fetchTargets = () => call({ action: 'getKpiTargets' }).then((d) => d.targets);
export const saveTargets = (targets) => call({ action: 'saveKpiTargets', targets: JSON.stringify(targets) }).then((d) => d.targets);
export const fetchTiers = () => call({ action: 'getKpiTiers' }).then((d) => d.tiers);
export const saveTiers = (tiers) => call({ action: 'saveKpiTiers', tiers: JSON.stringify(tiers) }).then((d) => d.tiers);

// ---- SLA المرتجعات (separate source: the «Sla RTO» sheet) ----
import { RETURNS_SLA_URL } from './config.js';

export async function fetchReturnsLive() {
  const res = await fetch(RETURNS_SLA_URL, { cache: 'no-store' });
  const txt = await res.text();
  let j;
  try { j = JSON.parse(txt); } catch { throw new Error(`الرد ليس JSON (HTTP ${res.status}) — غالبًا النشر ليس «Anyone» أو الرابط ليس رابط Web app`); }
  if (!j.ok) throw new Error(j.error || 'رد غير صالح من شيت SLA المرتجعات');
  return j;
}

/** Static snapshot (public/sla-data.js, 26/10/2026) — used only when the live sheet cannot be reached. */
export function fetchReturnsSnapshot() {
  return new Promise((resolve) => {
    if (window.RTO_SNAP) return resolve(window.RTO_SNAP);
    const s = document.createElement('script');
    s.src = `${import.meta.env.BASE_URL}sla-data.js`;
    s.onload = () => resolve(window.RTO_SNAP || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}
