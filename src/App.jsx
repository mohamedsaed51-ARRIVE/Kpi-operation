import React, { useEffect, useMemo, useState } from 'react';
import { fetchClientMonthly, fetchTargets, saveTargets } from './api.js';
import { API_URL } from './config.js';
import { demoData, demoTargets } from './demo.js';
import { managementSummary } from './lib/summary.js';
import { METRICS, MONTH_AR, evaluateAllMonths, evaluateBranches, evaluateMonth } from './lib/quality.js';
import {
  Badge, BaselineChart, BranchesTable, CustomersTable, KpiCards, SummaryBox, TrendTable, num,
} from './components.jsx';
import { BranchesPage, DataQualityPage, SettingsPage, SlaOverviewCards } from './pages.jsx';
import { SLA } from './lib/sla.js';
import { levelsFor, withLevels } from './lib/levels.js';

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
// To add a KPI: add a METRICS entry in src/lib/quality.js and a section here with kind: 'metric' —
// it appears in the sidebar, in «المؤشرات الرئيسية» and gets its own page.
const SECTIONS = [
  { id: 'overview', kind: 'overview', group: 'المؤشرات', label: 'المؤشرات الرئيسية', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', sub: 'ملخص مؤشرات الأداء الرئيسية' },
  { id: 'delivery', kind: 'metric', metric: 'delivery', group: 'المؤشرات', icon: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z' },
  { id: 'firstAttempt', kind: 'metric', metric: 'firstAttempt', group: 'المؤشرات', icon: 'M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z' },
  { id: 'branches', kind: 'branches', group: 'المؤشرات', label: 'Branch SLA', icon: 'M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', sub: SLA.description },
  { id: 'quality', kind: 'quality', group: 'أدوات', label: 'جودة البيانات', icon: 'M9 12l2 2 4-4M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', sub: 'تغطية الشهور وفحص البيانات والتصنيف — منفصلة عن المؤشرات' },
  { id: 'settings', kind: 'settings', group: 'أدوات', label: 'الإعدادات', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z', sub: 'مقاييس التقييم (مقبول / المطلوب / ممتاز) وتارجت الفروع لكل مؤشر' },
];
const sectionLabel = (x) => (x.metric ? METRICS[x.metric].label : x.label);
const sectionSub = (x) => (x.metric ? METRICS[x.metric].description : x.sub);
const GROUPS = [...new Set(SECTIONS.map((x) => x.group))];

/** Everything computed for one KPI (metric) so every KPI page uses the same engine. */
function useMetricResults(data, metric, month, opts, hasBranches) {
  const available = !!data && metric.available(data.clients);
  const o = useMemo(() => ({ ...opts, metric }), [opts.method, opts.minShipments, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = useMemo(() => (available ? evaluateAllMonths(data.clients, data.months, o) : []), [data, available, o]);
  const result = useMemo(() => (available && month ? evaluateMonth(data.clients, month, o) : null), [data, available, month, o]);
  const branchRows = useMemo(() => (result && !result.error && hasBranches ? evaluateBranches(data.clients, data.branches, result) : []), [data, result, hasBranches]);
  return { available, trend, result: result && !result.error ? result : null, branchRows };
}

function MetricPage({ m, month, setMonth, hasBranches, targets }) {
  const { result, trend, branchRows } = m;
  const metric = result.metric;
  return (
    <>
      <KpiCards result={result} />

      <section className="card">
        <h2>ملخص للإدارة</h2>
        <SummaryBox text={managementSummary(result)} />
      </section>

      <section className="card">
        <h2>{metric.avgLabel}: الأشهر السابقة مقابل الشهر المقاس</h2>
        <BaselineChart result={result} />
        <div className="levels">
          {metric.levels.map((l) => <span key={l.key} className="lvl-chip"><Badge level={l} /> {num(result.levelCounts[l.key])} عميل</span>)}
        </div>
        <h3 className="sub-h">الفروع — {MONTH_AR[result.month]}</h3>
        <BranchesTable rows={branchRows} result={result} hasData={hasBranches} targets={targets} />
      </section>

      <section className="card">
        <h2>النتيجة شهر بشهر</h2>
        <TrendTable rows={trend} selected={month} onSelect={setMonth} />
      </section>

      <section className="card">
        <h2>تفصيل العملاء — {MONTH_AR[result.month]}</h2>
        <CustomersTable result={result} />
      </section>

      {metric.id === 'firstAttempt' && (
        <details className="card">
          <summary>تعريف First Attempt</summary>
          <p className="muted">
            شحنة «تسليم من أول محاولة» = شحنة حالتها «تسليم ناجح» وتصنيف محاولتها «محاولة أولى» بنفس قاعدة الداش التشغيلية
            (الفرق بين تاريخ الاستلام وتاريخ آخر حالة لا يزيد عن الحد المضبوط للمحاولة الأولى، الافتراضي يوم واحد).
            الرفض (بنوعيه) والمرتجع وقيد التشغيل لا يُحسبون نجاحًا. نسبة العميل = التسليم من أول محاولة ÷ إجمالي شحناته في الشهر.
          </p>
        </details>
      )}
    </>
  );
}

const NeedsUpdate = () => (
  <div className="alert warn">
    بيانات First Attempt مش موجودة في رد السيرفر. اتأكد إن الباك إند المنشور هو آخر نسخة من <code>backend/Code.gs</code>.
  </div>
);

const needsControls = (kind) => kind === 'overview' || kind === 'metric' || kind === 'branches';

export default function App() {
  const demo = new URLSearchParams(location.search).has('demo');
  const [data, setData] = useState(null);
  const [targets, setTargets] = useState(null);
  const [targetsError, setTargetsError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [month, setMonth] = useState('');
  const [method, setMethod] = useState('pooled');
  const [minShipments, setMin] = useState(1);
  const [section, setSection] = useState('overview');

  const load = () => {
    setLoading(true); setError(''); setTargetsError('');
    (demo ? Promise.resolve(demoData()) : fetchClientMonthly())
      .then((d) => { setData(d); setUpdatedAt(new Date()); })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
    (demo ? Promise.resolve(demoTargets()) : fetchTargets())
      .then(setTargets)
      .catch((e) => setTargetsError(e.message || String(e)));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaveTargets = async (t) => { const saved = demo ? t : await saveTargets(t); setTargets(saved); };

  const opts = useMemo(() => ({ method, minShipments }), [method, minShipments]);
  const hasBranches = !!(data && Array.isArray(data.branches) && data.clients.some((c) => c.b));
  const dLevels = JSON.stringify(levelsFor(targets, 'delivery').map((l) => l.minDelta));
  const fLevels = JSON.stringify(levelsFor(targets, 'firstAttempt').map((l) => l.minDelta));
  const slaLevels = useMemo(() => levelsFor(targets, 'sla'), [targets]);
  const deliveryMetric = useMemo(() => withLevels(METRICS.delivery, targets), [dLevels]); // eslint-disable-line react-hooks/exhaustive-deps
  const firstMetric = useMemo(() => withLevels(METRICS.firstAttempt, targets), [fLevels]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = {
    delivery: useMetricResults(data, deliveryMetric, month, opts, hasBranches),
    firstAttempt: useMetricResults(data, firstMetric, month, opts, hasBranches),
  };
  const months = results.delivery.trend; // same eligible months for every KPI
  useEffect(() => {
    if (data && months.length && !months.some((t) => t.month === month)) setMonth(months[months.length - 1].month);
  }, [data, months, month]);

  const current = SECTIONS.find((x) => x.id === section);
  const cur = current.metric ? results[current.metric] : null;
  const monthShown = results.delivery.result?.month;

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand">
          <span className="logo">ARRIVE</span>
          <span className="side-title">KPI Operation</span>
        </div>
        <nav className="nav" role="tablist" aria-label="الأقسام">
          {GROUPS.map((g) => (
            <React.Fragment key={g}>
              <div className="nav-title">{g}</div>
              {SECTIONS.filter((x) => x.group === g).map((x) => (
                <button key={x.id} role="tab" aria-selected={section === x.id} className={`nav-item ${section === x.id ? 'on' : ''}`} onClick={() => setSection(x.id)}>
                  <Icon d={x.icon} /><span>{sectionLabel(x)}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>
        <div className="side-foot">
          المصدر: Google Sheets
          {updatedAt && <div>آخر تحديث: {updatedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>}
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <div>
            <h1>{sectionLabel(current)}</h1>
            <p className="sub">{sectionSub(current)}</p>
          </div>
          <div className="head-actions">
            {needsControls(current.kind) && monthShown && <span className="period">الشهر المقاس: <b>{MONTH_AR[monthShown]}</b></span>}
            <button className="btn" onClick={load} disabled={loading}>{loading ? 'جاري التحميل…' : 'تحديث'}</button>
          </div>
        </header>

        {demo && <div className="alert warn">⚠ بيانات تجريبية للمعاينة فقط (<code>?demo=1</code>) — مش أرقام ARRIVE الحقيقية.</div>}
        {!demo && !API_URL && <div className="alert err"><b>رابط الباك إند لسه ما اتضبطش.</b> انشر <code>backend/Code.gs</code> كمشروع Apps Script مستقل وحط رابطه في <code>VITE_API_URL</code>.</div>}
        {error && API_URL && <div className="alert err"><b>تعذر تحميل البيانات.</b> {error}</div>}
        {loading && !data && API_URL && <div className="alert">جاري تحميل البيانات من Google Sheets… (أول مرة ممكن ياخد وقت)</div>}

        {data && (
          <>
            {needsControls(current.kind) && (
              <section className="controls">
                <label>الشهر المقاس
                  <select value={month} onChange={(e) => setMonth(e.target.value)}>
                    {months.map((t) => <option key={t.month} value={t.month}>{MONTH_AR[t.month]}</option>)}
                  </select>
                </label>
                <label>طريقة المتوسط
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="pooled">مجمّع (إجمالي ÷ إجمالي)</option>
                    <option value="mean">متوسط النسب الشهرية</option>
                  </select>
                </label>
                <label>أقل عدد شحنات للعميل في كل شهر
                  <input type="number" min="1" value={minShipments} onChange={(e) => setMin(Math.max(1, Number(e.target.value) || 1))} />
                </label>
              </section>
            )}

            {needsControls(current.kind) && !months.length && <div className="alert warn">مفيش شهر معاه 3 شهور سابقة متاحة. تفاصيل التغطية في «جودة البيانات».</div>}

            {current.kind === 'overview' && months.length > 0 && SECTIONS.filter((x) => x.kind === 'metric').map((x) => {
              const r = results[x.metric];
              return (
                <section className="group" key={x.id}>
                  <div className="group-head">
                    <h2>{sectionLabel(x)}</h2>
                    <button className="link" onClick={() => setSection(x.id)}>عرض التفاصيل ←</button>
                  </div>
                  {r.result ? <KpiCards result={r.result} /> : !r.available ? <NeedsUpdate /> : null}
                </section>
              );
            })}

            {current.kind === 'overview' && months.length > 0 && (
              <section className="group">
                <div className="group-head">
                  <h2>Branch SLA</h2>
                  <button className="link" onClick={() => setSection('branches')}>عرض التفاصيل ←</button>
                </div>
                <SlaOverviewCards data={data} delivery={results.delivery} levels={slaLevels} />
              </section>
            )}

            {current.kind === 'metric' && cur && (!cur.available ? <NeedsUpdate /> : cur.result && (
              <MetricPage m={cur} month={month} setMonth={setMonth} hasBranches={hasBranches} targets={targets} />
            ))}

            {current.kind === 'branches' && months.length > 0 && <BranchesPage data={data} delivery={results.delivery} targets={targets} levels={slaLevels} />}

            {current.kind === 'quality' && <DataQualityPage data={data} />}

            {current.kind === 'settings' && (
              <SettingsPage
                branches={data.branches}
                targets={targets}
                onSave={onSaveTargets}
                unavailableReason={targets === null ? (targetsError ? `تعذر تحميل التارجت: ${targetsError}` : 'جاري تحميل التارجت…') : (hasBranches ? '' : 'تفصيل الفروع مش موجود في رد السيرفر.')}
              />
            )}
          </>
        )}
        <footer>ARRIVE — KPI Operation · المصدر: Google Sheets</footer>
      </main>
    </div>
  );
}
