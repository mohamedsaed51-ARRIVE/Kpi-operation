import React, { useEffect, useMemo, useState } from 'react';
import { MONTH_AR, METRICS } from './lib/quality.js';
import { cleanTargets, invalidCells, normBranch } from './lib/targets.js';
import { apiChecks, monthCoverage, namesWithEntities, similarNames } from './lib/dataQuality.js';
import { Badge, CustomersTable, KpiCards, num } from './components.jsx';

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
const SETTINGS_METRICS = [METRICS.delivery, METRICS.firstAttempt];

export function SettingsPage({ branches, targets, onSave, unavailableReason }) {
  const toDraft = (t) => Object.fromEntries(SETTINGS_METRICS.map((m) => [m.id, Object.fromEntries(Object.entries(t?.[m.id] || {}).map(([b, v]) => [b, String(v)]))]));
  const [draft, setDraft] = useState(() => toDraft(targets));
  const [bulk, setBulk] = useState({ delivery: '', firstAttempt: '' });
  const [state, setState] = useState({ saving: false, message: '', error: '' });
  useEffect(() => { setDraft(toDraft(targets)); }, [targets]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => {
    const names = new Set((branches || []).map(normBranch));
    SETTINGS_METRICS.forEach((m) => Object.keys(targets?.[m.id] || {}).forEach((b) => names.add(b)));
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [branches, targets]);

  const bad = useMemo(() => invalidCells(draft), [draft]);
  const badKey = new Set(bad.map((b) => `${b.metricId}|${b.branch}`));
  const dirty = JSON.stringify(cleanTargets(draft)) !== JSON.stringify(cleanTargets(toDraft(targets)));

  const setCell = (metricId, branch, value) => setDraft((d) => ({ ...d, [metricId]: { ...d[metricId], [branch]: value } }));
  const applyAll = (metricId) => setDraft((d) => ({ ...d, [metricId]: Object.fromEntries(all.map((b) => [b, bulk[metricId]])) }));
  const save = async () => {
    setState({ saving: true, message: '', error: '' });
    try { await onSave(cleanTargets(draft)); setState({ saving: false, message: 'تم حفظ التارجت على السيرفر.', error: '' }); }
    catch (e) { setState({ saving: false, message: '', error: e.message || String(e) }); }
  };

  if (unavailableReason) return <div className="alert warn">{unavailableReason}</div>;
  if (!all.length) return <div className="alert warn">مفيش فروع في البيانات لإدخال تارجت لها.</div>;
  return (
    <section className="card">
      <h2>تارجت الفروع</h2>
      <p className="muted">
        التارجت = النسبة المطلوب أن يحققها الفرع (٪) في الشهر المقاس. يظهر في جدول الفروع داخل صفحة كل مؤشر مع «محقق / لم يتحقق».
        اترك الخانة فاضية لو مفيش تارجت لهذا الفرع. القيمة بين 0 و100.
      </p>
      <div className="bulk">
        {SETTINGS_METRICS.map((m) => (
          <div key={m.id} className="bulk-item">
            <span>{m.label}: نفس القيمة لكل الفروع</span>
            <input type="number" min="0" max="100" step="0.1" value={bulk[m.id]} onChange={(e) => setBulk((b) => ({ ...b, [m.id]: e.target.value }))} placeholder="مثلاً 90" />
            <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => applyAll(m.id)} disabled={bulk[m.id] === ''}>تطبيق</button>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>الفرع</th>{SETTINGS_METRICS.map((m) => <th key={m.id}>تارجت {m.label} (٪)</th>)}</tr></thead>
          <tbody>
            {all.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                {SETTINGS_METRICS.map((m) => (
                  <td key={m.id}>
                    <input type="number" min="0" max="100" step="0.1" className={badKey.has(`${m.id}|${b}`) ? 'invalid' : ''}
                      value={draft[m.id]?.[b] ?? ''} onChange={(e) => setCell(m.id, b, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bad.length > 0 && <div className="alert err" style={{ marginTop: 12 }}>{bad.length} خانة قيمتها غير صالحة (لازم رقم بين 0 و100) ولن تُحفظ.</div>}
      {state.error && <div className="alert err" style={{ marginTop: 12 }}><b>تعذر الحفظ.</b> {state.error}</div>}
      {state.message && <div className="alert" style={{ marginTop: 12 }}>{state.message}</div>}
      <div style={{ marginTop: 14 }}>
        <button className="btn" onClick={save} disabled={state.saving || !dirty}>{state.saving ? 'جاري الحفظ…' : 'حفظ التارجت'}</button>
        {dirty && <span className="muted" style={{ marginInlineStart: 12 }}>فيه تغييرات لم تُحفظ</span>}
      </div>
    </section>
  );
}
