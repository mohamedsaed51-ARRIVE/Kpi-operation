import React, { useEffect, useMemo, useState } from 'react';
import { MONTH_AR, METRICS } from './lib/quality.js';
import { cleanTargets, invalidCells, meetsMaxTarget, normBranch, targetFor } from './lib/targets.js';
import { apiChecks, monthCoverage, namesWithEntities, similarNames } from './lib/dataQuality.js';
import { SLA, evaluateSlaBranches, thresholdsTextSla } from './lib/sla.js';
import { RETURNS_SLA_KEY } from './lib/returnsSla.js';
import { LEVEL_FIELDS, DEFAULT_THRESHOLDS, isReservedKey, levelLocation, thresholdsValid } from './lib/levels.js';
import { Badge, CustomersTable, Kpi, KpiCards, num } from './components.jsx';

/* ------------------------------------------------------------------ العملاء */
export function CustomersPage({ results }) {
  const options = Object.values(METRICS).filter((m) => results[m.id]?.available && results[m.id]?.result);
  const [metricId, setMetricId] = useState('delivery');
  const id = options.some((m) => m.id === metricId) ? metricId : options[0]?.id;
  const r = id ? results[id].result : null;
  if (!r) return <div className="alert warn">مفيش بيانات عملاء متاحة للشهر المختار.</div>;
  return (
    <>
      <div className="seg" role="tablist" aria-label="المؤشر">
        {options.map((m) => (
          <button key={m.id} role="tab" aria-selected={id === m.id} className={`seg-btn ${id === m.id ? 'on' : ''}`} onClick={() => setMetricId(m.id)}>{m.label}</button>
        ))}
      </div>
      <KpiCards result={r} />
      <section className="card">
        <h2>تفصيل العملاء — {MONTH_AR[r.month]}</h2>
        <div className="levels" style={{ marginBottom: 10 }}>
          {r.metric.levels.map((l) => <span key={l.key} className="lvl-chip"><Badge level={l} /> {num(r.levelCounts[l.key])} عميل</span>)}
        </div>
        <CustomersTable result={r} />
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ جودة البيانات */
export function DataQualityPage({ data }) {
  const coverage = useMemo(() => monthCoverage(data), [data]);
  const entities = useMemo(() => namesWithEntities(data.clients), [data]);
  const similar = useMemo(() => similarNames(data.clients), [data]);
  const checks = useMemo(() => apiChecks(data, [METRICS.firstAttempt]), [data]);
  const missing = coverage.filter((c) => !c.available);
  return (
    <>
      <section className="card">
        <h2>تغطية الشهور</h2>
        <p className="muted">المتاح = شهر له ملخص محفوظ (Snapshot) في الداش التشغيلية. الشهور غير المتاحة لا تدخل في أي حساب.{missing.length > 0 && ` غير متاح حاليًا: ${missing.map((m) => MONTH_AR[m.month]).join('، ')}.`}</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>الشهر</th><th>الحالة</th><th>عملاء</th><th>شحنات</th><th>تسليم</th><th>رفض + دفع شحن</th><th>تسليم من أول محاولة</th></tr></thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.month}>
                  <td><b>{MONTH_AR[c.month]}</b></td>
                  <td>{c.available ? <span className="badge lv-excellent">✔ متاح</span> : <span className="badge lv-acceptable">لا يوجد ملخص محفوظ</span>}</td>
                  <td className="n">{c.available ? num(c.customers) : '—'}</td>
                  <td className="n">{c.available ? num(c.total) : '—'}</td>
                  <td className="n">{c.available ? num(c.delivered) : '—'}</td>
                  <td className="n">{c.available ? num(c.paid) : '—'}</td>
                  <td className="n">{c.available ? num(c.first) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>فحص رد السيرفر</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>البند</th><th>النتيجة</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.name}><td>{c.name}</td><td>{c.ok ? <span className="badge lv-excellent">✔ سليم</span> : <span className="badge lv-below">✖ ناقص — {c.hint}</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>تصنيف الحالات</h2>
        <p className="muted">تُحسب «دفع شحن» فقط الحالات النهائية اللي نصها فيه: {(data.paidKeywords || []).join('، ')}. أي رفض تاني (زي رفض الدفع) لا يُحسب نجاح.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>الحالة</th><th>التصنيف هنا</th><th>عدد الشحنات (كل الشهور)</th></tr></thead>
            <tbody>
              {data.statusClassification.map((st) => (
                <tr key={st.status}>
                  <td>{st.status}</td>
                  <td>{st.cls === 'delivered' ? 'تسليم' : st.cls === 'paid' ? 'رفض + دفع شحن (يُحسب نجاح)' : 'رفض آخر (لا يُحسب)'}</td>
                  <td className="n">{num(st.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>أسماء العملاء</h2>
        <p className="muted">مشاكل في بيانات المصدر نفسه (تظهر هنا للتصحيح، ولا تتغير في الحساب).</p>
        <h3 className="sub-h">أسماء فيها رموز HTML ({num(entities.length)})</h3>
        {entities.length ? <ul className="plain">{entities.slice(0, 30).map((n) => <li key={n}><code>{n}</code></li>)}</ul> : <p className="muted">لا يوجد.</p>}
        <h3 className="sub-h">أسماء متشابهة (ممكن تكون نفس العميل مسجل مرتين) ({num(similar.length)})</h3>
        {similar.length ? <ul className="plain">{similar.slice(0, 30).map((g) => <li key={g.join('|')}>{g.join(' ⟷ ')}</li>)}</ul> : <p className="muted">لا يوجد.</p>}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ الإعدادات */
// One column per KPI: percentage targets (higher is better) and the SLA target in days (lower is better).
const LEVEL_ROW_EXTRA = { id: 'returnsSla', label: 'SLA المرتجعات', unit: 'يوم', max: 60, step: 0.01 };
const SETTINGS_METRICS = [
  { id: 'delivery', label: METRICS.delivery.label, unit: '٪', max: 100, step: 0.1, example: 'مثلاً 90' },
  { id: 'firstAttempt', label: METRICS.firstAttempt.label, unit: '٪', max: 100, step: 0.1, example: 'مثلاً 45' },
  { id: 'sla', label: SLA.label, unit: 'يوم', max: 60, step: 0.01, example: 'مثلاً 2' },
];

export function SettingsPage({ branches, targets, onSave, unavailableReason }) {
  const toDraft = (t) => Object.fromEntries(SETTINGS_METRICS.map((m) => [m.id, Object.fromEntries(Object.entries(t?.[m.id] || {}).map(([b, v]) => [b, String(v)]))]));
  const [draft, setDraft] = useState(() => toDraft(targets));
  const [bulk, setBulk] = useState({ delivery: '', firstAttempt: '', sla: '' });
  const [state, setState] = useState({ saving: false, message: '', error: '' });
  useEffect(() => { setDraft(toDraft(targets)); }, [targets]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => {
    const names = new Set((branches || []).map(normBranch));
    SETTINGS_METRICS.forEach((m) => Object.keys(targets?.[m.id] || {}).filter((b) => !isReservedKey(b)).forEach((b) => names.add(b)));
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [branches, targets]);

  const bad = useMemo(() => invalidCells(draft), [draft]);
    const badKey = new Set(bad.map((b) => `${b.metricId}|${b.branch}`));
  const dirty = JSON.stringify(cleanTargets(draft)) !== JSON.stringify(cleanTargets(toDraft(targets)));

  const setCell = (metricId, branch, value) => setDraft((d) => ({ ...d, [metricId]: { ...d[metricId], [branch]: value } }));
  const applyAll = (metricId) => setDraft((d) => ({
    ...d,
    [metricId]: { ...Object.fromEntries(Object.entries(d[metricId] || {}).filter(([k]) => isReservedKey(k))), ...Object.fromEntries(all.map((b) => [b, bulk[metricId]])) },
  }));
  const levelRows = [...SETTINGS_METRICS, LEVEL_ROW_EXTRA];
  const levelCell = (metricId, field) => { const [b, k] = levelLocation(metricId, field); return draft[b]?.[k] ?? ''; };
  const setLevel = (metricId, field, v) => { const [b, k] = levelLocation(metricId, field); setCell(b, k, v); };
  const effective = (metricId) => Object.fromEntries(LEVEL_FIELDS.map((f) => [f, levelCell(metricId, f) === '' ? DEFAULT_THRESHOLDS[metricId][f] : levelCell(metricId, f)]));
  const badLevels = levelRows.filter((m) => !thresholdsValid(effective(m.id)));
  const resetLevels = () => setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, cells]) => [id, Object.fromEntries(Object.entries(cells).filter(([k]) => !k.startsWith('__level_')))])));
  const save = async () => {
    setState({ saving: true, message: '', error: '' });
    try { await onSave(cleanTargets(draft)); setState({ saving: false, message: 'تم حفظ الإعدادات على السيرفر.', error: '' }); }
    catch (e) { setState({ saving: false, message: '', error: e.message || String(e) }); }
  };

  if (unavailableReason) return <div className="alert warn">{unavailableReason}</div>;
  if (!all.length) return <div className="alert warn">مفيش فروع في البيانات لإدخال تارجت لها.</div>;
  return (
    <>
    <section className="card">
      <h2>مقاييس التقييم</h2>
      <p className="muted">
        الحد الأدنى للتحسن عشان المؤشر يتقيّم «مقبول» أو «المطلوب» أو «ممتاز». نسبة التسليم: زيادة بالنقاط المئوية عن متوسط آخر 3 شهور. First Attempt: زيادة بالنقاط المئوية عن شهر أكتوبر.
        Branch SLA: نقص في متوسط مدة التسليم بالأيام عن أكتوبر (الأسرع أحسن). SLA المرتجعات: نقص في متوسط عمر المرتجع بالأيام عن متوسط آخر 3 شهور (من غير تقسيم على العملاء). الخانة الفاضية = القيمة الافتراضية. لازم مقبول ≤ المطلوب ≤ ممتاز.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>المؤشر</th><th>الوحدة</th><th>مقبول</th><th>المطلوب</th><th>ممتاز</th></tr></thead>
          <tbody>
            {levelRows.map((m) => (
              <tr key={m.id}>
                <td>{m.id === 'sla' ? 'Branch SLA' : m.label}</td>
                <td>{m.id === 'sla' || m.id === 'returnsSla' ? 'يوم أسرع (≥)' : 'نقطة مئوية زيادة (≥)'}</td>
                {LEVEL_FIELDS.map((f) => (
                  <td key={f}>
                    <input type="number" min="0" max={m.max} step={m.step} placeholder={String(DEFAULT_THRESHOLDS[m.id][f])}
                      className={badLevels.includes(m) ? 'invalid' : ''}
                      value={levelCell(m.id, f)} onChange={(e) => setLevel(m.id, f, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {badLevels.length > 0 && <div className="alert err" style={{ marginTop: 12 }}>ترتيب المقاييس غير صحيح في: {badLevels.map((m) => (m.id === 'sla' ? 'Branch SLA' : m.label)).join('، ')} — لازم مقبول ≤ المطلوب ≤ ممتاز، وبدون قيم سالبة.</div>}
      <div style={{ marginTop: 10 }}><button className="btn ghost" style={{ marginTop: 0 }} onClick={resetLevels}>رجّع القيم الافتراضية</button></div>
    </section>

    <section className="card">
      <h2>حد SLA المرتجعات</h2>
      <p className="muted">
        أقصى عمر مقبول للمرتجع بالأيام (من تقفيل الشحنة لتقفيل المرتجع). المرتجع «داخل الحد» لو عمره ≤ الحد، ويظهر في تاب «SLA المرتجعات».
        اتركه فاضي لو مفيش حد معتمد (مفيش حكم داخل/خارج الحد).
      </p>
      <label>حد الـ SLA (أيام)
        <input type="number" min="0" max="60" step="1" placeholder="غير محدد" value={draft.sla?.[RETURNS_SLA_KEY] ?? ''}
          className={badKey.has(`sla|${RETURNS_SLA_KEY}`) ? 'invalid' : ''} onChange={(e) => setCell('sla', RETURNS_SLA_KEY, e.target.value)} />
      </label>
    </section>

    <section className="card">
      <h2>تارجت الفروع</h2>
      <p className="muted">
        نسبة التسليم وFirst Attempt: التارجت = النسبة المطلوب أن يحققها الفرع (٪) في الشهر المقاس، ويظهر في جدول الفروع داخل صفحة المؤشر.
        SLA التسليم: التارجت = أقصى متوسط مدة تسليم بالأيام (الأقل أحسن)، ويظهر في صفحة «Branch SLA». «محقق / لم يتحقق» بيتحسب تلقائيًا.
        اترك الخانة فاضية لو مفيش تارجت. النسب بين 0 و100، والأيام بين 0 و60.
      </p>
      <div className="bulk">
        {SETTINGS_METRICS.map((m) => (
          <div key={m.id} className="bulk-item">
            <span>{m.label} ({m.unit}): نفس القيمة لكل الفروع</span>
            <input type="number" min="0" max={m.max} step={m.step} value={bulk[m.id]} onChange={(e) => setBulk((b) => ({ ...b, [m.id]: e.target.value }))} placeholder={m.example} />
            <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => applyAll(m.id)} disabled={bulk[m.id] === ''}>تطبيق</button>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>الفرع</th>{SETTINGS_METRICS.map((m) => <th key={m.id}>تارجت {m.label} ({m.unit})</th>)}</tr></thead>
          <tbody>
            {all.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                {SETTINGS_METRICS.map((m) => (
                  <td key={m.id}>
                    <input type="number" min="0" max={m.max} step={m.step} className={badKey.has(`${m.id}|${b}`) ? 'invalid' : ''}
                      value={draft[m.id]?.[b] ?? ''} onChange={(e) => setCell(m.id, b, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bad.length > 0 && <div className="alert err" style={{ marginTop: 12 }}>{bad.length} خانة قيمتها غير صالحة (النسب بين 0 و100، والأيام بين 0 و60) ولن تُحفظ.</div>}
      {state.error && <div className="alert err" style={{ marginTop: 12 }}><b>تعذر الحفظ.</b> {state.error}</div>}
      {state.message && <div className="alert" style={{ marginTop: 12 }}>{state.message}</div>}
      <div style={{ marginTop: 14 }}>
        <button className="btn" onClick={save} disabled={state.saving || !dirty || badLevels.length > 0}>{state.saving ? 'جاري الحفظ…' : 'حفظ الإعدادات'}</button>
        {dirty && <span className="muted" style={{ marginInlineStart: 12 }}>فيه تغييرات لم تُحفظ</span>}
      </div>
    </section>
    </>
  );
}

/* ------------------------------------------------------------------ ما حصل في شهر الأساس (أكتوبر) */
const SIMPLE_NUM = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pc1 = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);

function SnapTable({ title, cols, rows, defaultSort }) {
  const [sort, setSort] = useState(defaultSort);
  const [q, setQ] = useState('');
  const list = useMemo(() => rows.filter((r) => !q || String(r[cols[0].k]).includes(q.trim())).sort((a, b) => {
    const A = a[sort.key], B = b[sort.key];
    const c = typeof A === 'string' ? A.localeCompare(B, 'ar') : (A ?? -Infinity) - (B ?? -Infinity);
    return sort.dir === 'asc' ? c : -c;
  }), [rows, sort, q, cols]);
  return (
    <>
      <h3 className="sub-h">{title} ({SIMPLE_NUM(rows.length)})</h3>
      <div className="toolbar"><input placeholder="بحث بالاسم…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="table-wrap"><table>
        <thead><tr>{cols.map((c) => (
          <th key={c.k} className="sortable" onClick={() => setSort((x) => ({ key: c.k, dir: x.key === c.k && x.dir === 'desc' ? 'asc' : 'desc' }))}>{c.label}{sort.key === c.k ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}</th>
        ))}</tr></thead>
        <tbody>
          {list.slice(0, 300).map((r, i) => <tr key={i}>{cols.map((c, j) => <td key={c.k} className={j ? 'n' : ''}>{c.f ? c.f(r[c.k]) : r[c.k]}</td>)}</tr>)}
          {!list.length && <tr><td colSpan={cols.length} className="muted center">مفيش نتائج</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

/** Cards of the baseline month alone (also used in «المؤشرات الرئيسية» while no later month can be compared). */
export function MonthSnapshotCards({ snap, metric }) {
  if (!snap || !snap.customers) return <div className="alert warn">مفيش شحنات لشهر {MONTH_AR[snap?.month]} في البيانات.</div>;
  return (
    <section className="kpis">
      <Kpi title="عدد العملاء" value={num(snap.customers)} />
      <Kpi title="إجمالي الشحنات" value={num(snap.total)} />
      <Kpi title={metric.successDescription} value={num(snap.success)} />
      <Kpi title={`${metric.label} ${MONTH_AR[snap.month]}`} value={pc1(snap.rate)} tone="brand" />
    </section>
  );
}
export function SlaSnapshotCards({ snap }) {
  if (!snap || !snap.delivered) return <div className="alert warn">مفيش شحنات مسلّمة لشهر {MONTH_AR[snap?.month]} في البيانات.</div>;
  return (
    <section className="kpis">
      <Kpi title="عدد الفروع" value={num(snap.rows.length)} />
      <Kpi title="عدد العملاء" value={num(snap.customers)} />
      <Kpi title="الشحنات المسلّمة" value={num(snap.delivered)} />
      <Kpi title={`${SLA.avgLabel} ${MONTH_AR[snap.month]}`} value={`${d2(snap.avg)} يوم`} tone="brand" />
    </section>
  );
}

/** First Attempt (or any % KPI): what happened in the baseline month, without any comparison. */
export function MonthSnapshotView({ snap, metric }) {
  if (!snap || !snap.customers) return <div className="alert warn">مفيش شحنات لشهر {MONTH_AR[snap?.month]} في البيانات.</div>;
  return (
    <section className="card">
      <h2>اللي حصل في {MONTH_AR[snap.month]} (شهر الأساس)</h2>
      <p className="muted">أرقام {MONTH_AR[snap.month]} وحدها بدون مقارنة، لنفس عملاء نسبة التسليم. بتتحول لمقارنة أول ما يبقى فيه شهر بعده.</p>
      <MonthSnapshotCards snap={snap} metric={metric} />
      <SnapTable title="الفروع" defaultSort={{ key: 'total', dir: 'desc' }} rows={snap.branchRows}
        cols={[{ k: 'branch', label: 'الفرع' }, { k: 'customers', label: 'عدد العملاء', f: SIMPLE_NUM }, { k: 'total', label: 'الشحنات', f: SIMPLE_NUM }, { k: 'success', label: metric.successDescription, f: SIMPLE_NUM }, { k: 'rate', label: 'النسبة', f: pc1 }]} />
      <SnapTable title="العملاء" defaultSort={{ key: 'total', dir: 'desc' }} rows={snap.rows}
        cols={[{ k: 'name', label: 'العميل' }, { k: 'total', label: 'الشحنات', f: SIMPLE_NUM }, { k: 'success', label: metric.successDescription, f: SIMPLE_NUM }, { k: 'rate', label: 'النسبة', f: pc1 }]} />
    </section>
  );
}

/** Branch SLA: average delivery days per branch in the baseline month. */
export function SlaSnapshotView({ snap }) {
  if (!snap || !snap.delivered) return <div className="alert warn">مفيش شحنات مسلّمة لشهر {MONTH_AR[snap?.month]} في البيانات.</div>;
  return (
    <section className="card">
      <h2>Branch SLA — اللي حصل في {MONTH_AR[snap.month]} (شهر الأساس)</h2>
      <p className="muted">متوسط مدة التسليم في {MONTH_AR[snap.month]} وحده بدون مقارنة، لنفس عملاء نسبة التسليم.</p>
      <SlaSnapshotCards snap={snap} />
      <SnapTable title="الفروع" defaultSort={{ key: 'avg', dir: 'desc' }} rows={snap.rows}
        cols={[{ k: 'branch', label: 'الفرع' }, { k: 'customers', label: 'عدد العملاء', f: SIMPLE_NUM }, { k: 'delivered', label: 'الشحنات المسلّمة', f: SIMPLE_NUM }, { k: 'avg', label: `${SLA.avgLabel} (يوم)`, f: d2 }]} />
    </section>
  );
}

/* ------------------------------------------------------------------ الفروع (SLA التسليم) */
const d2 = (v) => (v === null || v === undefined ? '—' : v.toFixed(2));
const imp = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(3)}`); // 3 decimals so a 0.1996 improvement is not shown as 0.20 next to a lower level

function SlaTargetCells({ current, target }) {
  const met = meetsMaxTarget(current, target);
  return (
    <>
      <td className="n">{target === null ? <span className="muted">—</span> : d2(target)}</td>
      <td>
        {met === null ? <span className="muted">لم يُحدد تارجت</span>
          : met ? <span className="badge lv-excellent">✔ محقق</span>
            : <span className="badge lv-below">✖ لم يتحقق (أبطأ بـ {d2(current - target)} يوم)</span>}
      </td>
    </>
  );
}

/** SLA التسليم KPI cards — used by the الفروع page and by «المؤشرات الرئيسية». */
function SlaCards({ rows, group, ev, levels }) {
  return (
    <section className="kpis">
      <Kpi title="عدد الفروع" value={num(rows.length)} sub={`${num(group.customers)} عميل محسوب (نفس عملاء باقي المؤشرات)`} />
      <Kpi title={SLA.avgLabel} value={`${d2(group.baseline)} يوم`} sub={ev.prev.map((m) => MONTH_AR[m]).join(' + ')} />
      <Kpi title={`${SLA.avgLabel} ${MONTH_AR[ev.month]}`} value={`${d2(group.current)} يوم`} tone="brand" sub={`${num(group.delivered)} شحنة مسلّمة`} />
      <Kpi title="التحسن" value={`${imp(group.improvement)} يوم`} tone={group.improvement >= 0 ? 'good' : 'bad'} sub="الموجب = أسرع من شهر الأساس (أكتوبر)" />
      <div className={`kpi verdict ${group.level ? `lv-${group.level.key}` : ''}`}>
        <div className="kpi-title">التقييم</div>
        <div className="kpi-value"><Badge level={group.level} /></div>
        <div className="kpi-sub">{thresholdsTextSla(levels)}</div>
      </div>
    </section>
  );
}

/** Branch SLA cards for the overview (computes its own numbers). */
export function SlaOverviewCards({ data, delivery, levels }) {
  const available = SLA.available(data.clients) && Array.isArray(data.branches);
  const ev = delivery?.result;
  const { rows, group } = useMemo(
    () => (available && ev ? evaluateSlaBranches(data.clients, data.branches, ev, levels) : { rows: [], group: null }),
    [data, available, ev, levels],
  );
  if (!available) return <div className="alert warn">بيانات SLA التسليم مش موجودة في رد السيرفر. اتأكد إن الباك إند المنشور هو آخر نسخة.</div>;
  if (!ev || !group) return <div className="alert warn">مفيش بيانات كفاية لحساب SLA الفروع في الشهر المختار. الأساس شهر أكتوبر، فاختر شهرًا بعده (ولازم يكون ليه 3 شهور سابقة).</div>;
  return <SlaCards rows={rows} group={group} ev={ev} levels={levels} />;
}

export function BranchesPage({ data, delivery, targets, levels }) {
  const available = SLA.available(data.clients) && Array.isArray(data.branches);
  const ev = delivery?.result;
  const { rows, group } = useMemo(
    () => (available && ev ? evaluateSlaBranches(data.clients, data.branches, ev, levels) : { rows: [], group: null }),
    [data, available, ev, levels],
  );
  const [sort, setSort] = useState({ key: 'improvement', dir: 'desc' });
  const [q, setQ] = useState('');
  const [lv, setLv] = useState('all');
  const list = useMemo(() => rows.filter((r) => (!q || r.branch.includes(q.trim())) && (lv === 'all' || r.level.key === lv)).sort((a, b) => {
    const A = a[sort.key], B = b[sort.key];
    const c = typeof A === 'string' ? A.localeCompare(B, 'ar') : A - B;
    return sort.dir === 'asc' ? c : -c;
  }), [rows, q, lv, sort]);
  if (!available) return <div className="alert warn">بيانات SLA التسليم مش موجودة في رد السيرفر. اتأكد إن الباك إند المنشور هو آخر نسخة من <code>backend/Code.gs</code>.</div>;
  if (!ev || !group) return <div className="alert warn">مفيش بيانات كفاية لحساب SLA الفروع في الشهر المختار. الأساس شهر أكتوبر، فاختر شهرًا بعده (ولازم يكون ليه 3 شهور سابقة).</div>;
  const counts = Object.fromEntries(levels.map((l) => [l.key, rows.filter((r) => r.level.key === l.key).length]));
  const th = (key, label) => (
    <th className="sortable" onClick={() => setSort((x) => ({ key, dir: x.key === key && x.dir === 'desc' ? 'asc' : 'desc' }))}>
      {label}{sort.key === key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );
  return (
    <>
      <SlaCards rows={rows} group={group} ev={ev} levels={levels} />

      <section className="card">
        <h2>Branch SLA — SLA التسليم ({MONTH_AR[ev.month]})</h2>
        <div className="levels" style={{ marginBottom: 10 }}>
          {levels.map((l) => <span key={l.key} className="lvl-chip"><Badge level={l} /> {num(counts[l.key])} فرع</span>)}
        </div>
        <div className="toolbar">
          <input placeholder="ابحث باسم الفرع…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={lv} onChange={(e) => setLv(e.target.value)}>
            <option value="all">كل التقييمات ({rows.length})</option>
            {levels.map((l) => <option key={l.key} value={l.key}>{l.label} ({counts[l.key]})</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {th('branch', 'الفرع')}
                {th('customers', 'عدد العملاء')}
                {th('baseline', `${SLA.avgLabel} (${ev.prev.map((m) => MONTH_AR[m]).join(' + ')})`)}
                {th('current', `${SLA.avgLabel} ${MONTH_AR[ev.month]}`)}
                {th('improvement', 'التحسن (يوم)')}
                <th>التقييم</th>
                <th>التارجت (يوم)</th>
                <th>تحقيق التارجت</th>
                {th('delivered', `الشحنات المسلّمة ${MONTH_AR[ev.month]}`)}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.branch}>
                  <td>{r.branch}</td>
                  <td className="n">{num(r.customers)}</td>
                  <td className="n">{d2(r.baseline)}</td>
                  <td className="n"><b>{d2(r.current)}</b></td>
                  <td className="n">{imp(r.improvement)}</td>
                  <td><Badge level={r.level} /></td>
                  <SlaTargetCells current={r.current} target={targetFor(targets, 'sla', r.branch)} />
                  <td className="n">{num(r.delivered)}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan="9" className="muted center">مفيش نتائج</td></tr>}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr>
                  <td><b>الإجمالي</b></td><td className="n">{num(group.customers)}</td><td className="n">{d2(group.baseline)}</td>
                  <td className="n"><b>{d2(group.current)}</b></td><td className="n">{imp(group.improvement)}</td><td><Badge level={group.level} /></td><td>—</td><td>—</td><td className="n">{num(group.delivered)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="muted">
          SLA التسليم = متوسط مدة التسليم بالأيام (من الاستلام لآخر حالة) للشحنات المسلّمة، لنفس عملاء نسبة التسليم (الموجودين في الـ3 شهور السابقة والشهر المقاس)،
          مقارنة بشهر أكتوبر (الأساس) فقط. التحسن = متوسط أكتوبر − متوسط الشهر المقاس؛ النقص تحسّن.
        </p>
      </section>
    </>
  );
}
