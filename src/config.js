// Web App of the KPI backend (Apps Script). VITE_API_URL (.env / Vercel) overrides the default below.
//   VITE_API_URL=https://script.google.com/macros/s/XXXX/exec
const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycby0oE8F7J_l-RVwHcojEHVcQr9BqFvJwmrXyIE9Nsf-xpOvOnwePIPQX4DK0ezDw4VHLA/exec';
export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

// «SLA المرتجعات»: Web App of the returns sheet «Sla RTO» (Code-SLA.gs in the returns dashboard). VITE_RETURNS_SLA_URL overrides it.
export const RETURNS_SLA_URL = import.meta.env.VITE_RETURNS_SLA_URL
  || 'https://script.google.com/macros/s/AKfycbxa6AXkilUhoIpoUs_kcGVHIqcHL91t4oHBQ6gVz9qTPuB3vdaFdCYicpZMJEO4ePCn/exec';

// «الشكاوى والتعويضات»: Web App بتاع داش بورد الشكاوى (قراءة فقط). VITE_COMPLAINTS_API_URL overrides it.
export const COMPLAINTS_API_URL = import.meta.env.VITE_COMPLAINTS_API_URL
  || 'https://script.google.com/macros/s/AKfycbzkMVR_si8K6AIPbdEc45PVGTyoeWjeN4lSE64K699P8BEqi7-zFfodM8sb-jGV-Zbr/exec';
