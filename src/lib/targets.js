// Branch targets (percent, one per branch per KPI). Pure helpers — the values live on the server (action=getKpiTargets).

/** Same normalisation the server applies to branch names (trim + collapse spaces). */
export const normBranch = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

/** Target of a branch for a KPI, or null when none was entered. */
export function targetFor(targets, metricId, branch) {
  const v = targets?.[metricId]?.[normBranch(branch)];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** true / false, or null when there is no target (or no value) to compare. Tolerates floating-point noise. */
export function meetsTarget(current, target) {
  if (target === null || target === undefined || current === null || current === undefined) return null;
  return current + 1e-9 >= target;
}

/** Turn the settings form (strings) into the payload the server expects; empty / invalid cells are dropped. */
export function cleanTargets(draft) {
  const out = {};
  for (const [metricId, byBranch] of Object.entries(draft || {})) {
    out[metricId] = {};
    for (const [branch, raw] of Object.entries(byBranch || {})) {
      if (raw === '' || raw === null || raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) continue;
      out[metricId][normBranch(branch)] = n;
    }
  }
  return out;
}

/** Cells in the settings form that cannot be saved (so the UI can warn instead of silently dropping them). */
export function invalidCells(draft) {
  const bad = [];
  for (const [metricId, byBranch] of Object.entries(draft || {})) {
    for (const [branch, raw] of Object.entries(byBranch || {})) {
      if (raw === '' || raw === null || raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) bad.push({ metricId, branch, value: raw });
    }
  }
  return bad;
}
