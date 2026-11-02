// Branch targets (percent, one per branch per KPI). Pure helpers — the values live on the server (action=getKpiTargets).

/** Same normalisation the server applies to branch names (trim + collapse spaces). */
export const normBranch = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

/** Target of a branch for a KPI, or null when none was entered. */
export function targetFor(targets, metricId, branch) {
  const v = targets?.[metricId]?.[normBranch(branch)];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Largest value accepted per KPI: percentages up to 100; the SLA target is a number of days (lower is better).
export const TARGET_LIMITS = { delivery: 100, firstAttempt: 100, sla: 60 };
const limitOf = (metricId) => TARGET_LIMITS[metricId] ?? 100;

/** SLA only: met when the average delivery days is at most the target. */
export function meetsMaxTarget(current, target) {
  if (target === null || target === undefined || current === null || current === undefined) return null;
  return current <= target + 1e-9;
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
      if (!Number.isFinite(n) || n < 0 || n > limitOf(metricId)) continue;
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
      if (!Number.isFinite(n) || n < 0 || n > limitOf(metricId)) bad.push({ metricId, branch, value: raw });
    }
  }
  return bad;
}
