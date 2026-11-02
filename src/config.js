// Web App of the KPI backend (a SEPARATE Apps Script project — see backend/Code.gs). Set it in .env / Vercel:
//   VITE_API_URL=https://script.google.com/macros/s/XXXX/exec
export const API_URL = import.meta.env.VITE_API_URL || '';
