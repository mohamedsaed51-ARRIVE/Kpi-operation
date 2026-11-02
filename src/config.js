// Web App of the KPI backend (Apps Script). VITE_API_URL (.env / Vercel) overrides the default below.
//   VITE_API_URL=https://script.google.com/macros/s/XXXX/exec
const DEFAULT_API_URL =
  'https://script.google.com/macros/s/AKfycby0oE8F7J_l-RVwHcojEHVcQr9BqFvJwmrXyIE9Nsf-xpOvOnwePIPQX4DK0ezDw4VHLA/exec';
export const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
