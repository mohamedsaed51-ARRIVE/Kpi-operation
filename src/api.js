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
