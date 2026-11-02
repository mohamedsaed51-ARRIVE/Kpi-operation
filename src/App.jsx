import React, { useEffect, useMemo, useState } from 'react';
import { fetchClientMonthly } from './api.js';
import { demoData } from './demo.js';
import { managementSummary } from './lib/summary.js';
import {
  METRICS, MONTH_AR, evaluateAllMonths, evaluateBranches, evaluateMonth, thresholdsText,
} from './lib/quality.js';

const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${v.toFixed(d)}%`);
const pts = (v, d = 2) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)} نقطة`);
const pp = (v, d = 2) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
const num = (v) => (v ?? 0).toLocaleString('en-US');
const ICON = { excellent: '★', required: '✔', acceptable: '◐', below: '✖' };

function Badge({ level }) {
  if (!level) return <span className="muted">—</span>;
  return <span className={`badge lv-${level.key}`}><span aria-hidden>{ICON[level.key]}</span> {level.label}</span>;
}

function Kpi({ title, value, sub, tone }) {
  return (
    <div className={`kpi ${tone ? `tone-${tone}` : ''}`}>
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/** Baseline bars + average line + the 3 / 5 / 7 point target lines. */
function BaselineChart({ result }) {
  const g = result.group;
  if (g.baseline === null) return null;
  const bars = [
    ...result.prev.map((m, i) => ({ label: MONTH_AR[m], value: g.histMonthRates[i], kind: 'hist' })),
    { label: MONTH_AR[result.month], value: g.current, kind: 'cur' },
  ];
  const lines = [
    { y: g.baseline, label: 'المتوسط', cls: 'base' },
    ...[...result.metric.levels].slice(0, 3).reverse().map((l, i) => ({ y: g.baseline + l.minDelta, label: `+${l.minDelta}`, cls: ['l3', 'l5', 'l7'][i] })).filter((l) => l.y <= 100),
  ];
  const all = [...bars.map((b) => b.value), ...lines.map((l) => l.y)];
  const lo = Math.max(0, Math.floor(Math.min(...all) - 4));
  const hi = Math.min(100, Math.ceil(Math.max(...all) + 3));
  const W = 700, H = 300, L = 54, R = 120, T = 16, B = 40;
  const x = (i) => L + ((W - L - R) / bars.length) * (i + 0.5);
  const bw = Math.min(70, ((W - L - R) / bars.length) * 0.55);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) / 4) * i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`مقارنة ${result.metric.avgLabel} بالشهر المقاس`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{t.toFixed(0)}%</text>
        </g>
      ))}
      {bars.map((b, i) => (
        <g key={b.label}>
          <rect x={x(i) - bw / 2} y={y(b.value)} width={bw} height={y(lo) - y(b.value)} rx="4" className={b.kind === 'cur' ? 'bar-cur' : 'bar-hist'} />
          <text x={x(i)} y={y(b.value) - 6} textAnchor="middle" className="bar-val">{b.value.toFixed(1)}%</text>
          <text x={x(i)} y={H - 16} textAnchor="middle" className="axis">{b.label}</text>
        </g>
      ))}
      {lines.map((l) => (
        <g key={l.label}>
          <line x1={L} x2={W - R + 6} y1={y(l.y)} y2={y(l.y)} className={`tline ${l.cls}`} />
          <text x={W - R + 10} y={y(l.y) + 4} className={`tlabel ${l.cls}`}>{l.label === 'المتوسط' ? `المتوسط ${l.y.toFixed(1)}` : `${l.label} (${l.y.toFixed(1)})`}</text>
        </g>
      ))}
    </svg>
  );
}

function TrendTable({ rows, selected, onSelect }) {
  if (!rows.length) return <p className="muted">مفيش شهور فيها 3 شهور سابقة متاحة لعرض الاتجاه.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>الشهر</th><th>متوسط التسليمات</th><th>النسبة الحالية</th><th>الفرق</th><th>التقييم</th><th>عملاء محسوبين</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className={r.month === selected ? 'sel' : ''} onClick={() => onSelect(r.month)} style={{ cursor: 'pointer' }}>
              <td><b>{MONTH_AR[r.month]}</b></td>
              <td className="n">{pct(r.baseline)}</td>
              <td className="n">{pct(r.current)}</td>
              <td className="n">{pts(r.delta)}</td>
              <td><Badge level={r.level} /></td>
              <td className="n">{num(r.customers)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomersTable({ result }) {
  const [q, setQ] = useState('');
  const [lv, setLv] = useState('all');
  const [sort, setSort] = useState({ key: 'delta', dir: 'desc' });
  const [limit, setLimit] = useState(50);
  const rows = useMemo(() => {
    const f = result.rows.filter((r) => (lv === 'all' || r.level.key === lv) && (!q || r.name.includes(q.trim())));
    const val = (r) => (sort.key === 'name' ? r.name : sort.key === 'curTotal' ? r.curTotal : r[sort.key]);
    return f.sort((a, b) => {
      const A = val(a), B = val(b);
      const c = typeof A === 'string' ? A.localeCompare(B, 'ar') : A - B;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [result, q, lv, sort]);
  const th = (key, label) => (
    <th onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))} className="sortable">
      {label}{sort.key === key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );
  const exportCsv = () => {
    const head = ['العميل', ...result.prev.map((m) => `نسبة ${MONTH_AR[m]}`), 'متوسط التسليمات', `نسبة ${MONTH_AR[result.month]}`, 'الفرق (نقطة)', 'التقييم', `شحنات ${MONTH_AR[result.month]}`];
    const lines = rows.map((r) => [r.name, ...r.monthlyRates.map((x) => x.toFixed(2)), r.baseline.toFixed(2), r.current.toFixed(2), r.delta.toFixed(2), r.level.label, r.curTotal]);
    const csv = '﻿' + [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `kpi-${result.metric.id}-${result.month}.csv`; a.click();
  };
  return (
    <>
      <div className="toolbar">
        <input placeholder="ابحث باسم العميل…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={lv} onChange={(e) => setLv(e.target.value)}>
          <option value="all">كل التقييمات ({result.rows.length})</option>
          {result.metric.levels.map((l) => <option key={l.key} value={l.key}>{l.label} ({result.levelCounts[l.key]})</option>)}
        </select>
        <button className="btn" onClick={exportCsv}>تصدير CSV</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th('name', 'العميل')}
              {result.prev.map((m) => <th key={m}>{MONTH_AR[m]}</th>)}
              {th('baseline', 'متوسط التسليمات')}
              {th('current', `نسبة ${MONTH_AR[result.month]}`)}
              {th('delta', 'الفرق')}
              <th>التقييم</th>
              {th('curTotal', 'الشحنات')}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                {r.monthlyRates.map((x, i) => <td key={i} className="n muted">{pct(x)}</td>)}
                <td className="n">{pct(r.baseline)}</td>
                <td className="n"><b>{pct(r.current)}</b></td>
                <td className="n">{pts(r.delta)}</td>
                <td><Badge level={r.level} /></td>
                <td className="n">{num(r.curTotal)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={result.prev.length + 6} className="muted center">مفيش نتائج</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button className="btn ghost" onClick={() => setLimit((l) => l + 100)}>عرض المزيد ({rows.length - limit} متبقي)</button>}
    </>
  );
}

function SummaryBox({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return (
    <>
      <pre className="summary">{text}</pre>
      <button className="btn ghost" onClick={copy}>{copied ? 'تم النسخ ✔' : 'نسخ الملخص'}</button>
      <button className="btn ghost" style={{ marginInlineStart: 8 }} onClick={() => window.print()}>طباعة / PDF</button>
    </>
  );
}

function KpiCards({ result }) {
  const g = result.group, metric = result.metric;
  const deltaTone = g.delta === null ? '' : g.delta >= 0 ? 'good' : 'bad';
  return (
    <section className="kpis">
      <Kpi title="عدد العملاء" value={num(g.customers)}
        sub={`مستبعد: ${num(result.excluded.notInAllMonths)} (مش موجودين في الـ4 شهور)${result.excluded.belowMinimum ? ` + ${num(result.excluded.belowMinimum)} (أقل من الحد الأدنى)` : ''}`} />
      <Kpi title={metric.avgLabel} value={pct(g.baseline)} sub={result.prev.map((m) => MONTH_AR[m]).join(' + ')} />
      <Kpi title={`${metric.avgLabel} ${MONTH_AR[result.month]}`} value={pct(g.current)} tone="brand" sub={metric.successText(g)} />
      <Kpi title="الفرق" value={pp(g.delta)} tone={deltaTone} sub="الفرق بين الشهرين بالنقاط المئوية" />
      <div className={`kpi verdict ${g.level ? `lv-${g.level.key}` : ''}`}>
        <div className="kpi-title">التقييم</div>
        <div className="kpi-value"><Badge level={g.level} /></div>
        <div className="kpi-sub">{thresholdsText(metric)}</div>
      </div>
    </section>
  );
}

function BranchesTable({ rows, result, hasData }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'delta', dir: 'desc' });
  const list = useMemo(() => rows.filter((r) => !q || r.branch.includes(q.trim())).sort((a, b) => {
    const A = a[sort.key], B = b[sort.key];
    const c = typeof A === 'string' ? A.localeCompare(B, 'ar') : A - B;
    return sort.dir === 'asc' ? c : -c;
  }), [rows, q, sort]);
  if (!hasData) return <div className="alert warn">بيانات الفروع مش موجودة في رد السيرفر. السيرفر لسه على نسخة قديمة من <code>Code.gs</code>. حدّث الكود (فيه <code>withBranches</code>) في Apps Script واعمل Deploy جديد على نفس الـ Deployment. للتأكد افتح الرابط <code>…/exec?action=clientMonthly&amp;withBranches=1</code> ولازم تلاقي <code>"branches"</code> في الرد.</div>;
  const th = (key, label) => (
    <th onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))} className="sortable">
      {label}{sort.key === key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );
  const tot = rows.reduce((s, r) => ({ t: s.t + r.curTotal, ok: s.ok + r.curSuccess }), { t: 0, ok: 0 });
  return (
    <>
      <div className="toolbar"><input placeholder="ابحث باسم الفرع…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th('branch', 'الفرع')}
              {th('customers', 'عدد العملاء')}
              {th('baseline', `متوسط التسليمات (${result.prev.map((m) => MONTH_AR[m]).join(' + ')})`)}
              {th('current', `متوسط التسليمات ${MONTH_AR[result.month]}`)}
              {th('delta', 'الفرق')}
              <th>التقييم</th>
              {th('curTotal', `الشحنات ${MONTH_AR[result.month]}`)}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.branch}>
                <td>{r.branch}</td>
                <td className="n">{num(r.customers)}</td>
                <td className="n">{pct(r.baseline)}</td>
                <td className="n"><b>{pct(r.current)}</b></td>
                <td className="n">{pp(r.delta)}</td>
                <td><Badge level={r.level} /></td>
                <td className="n">{num(r.curTotal)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="7" className="muted center">مفيش نتائج</td></tr>}
          </tbody>
          {list.length > 0 && (
            <tfoot><tr><td><b>الإجمالي</b></td><td className="n">{num(result.group.customers)}</td><td className="n">{pct(result.group.baseline)}</td><td className="n"><b>{pct(result.group.current)}</b></td><td className="n">{pp(result.group.delta)}</td><td><Badge level={result.group.level} /></td><td className="n">{num(tot.t)}</td></tr></tfoot>
          )}
        </table>
      </div>
      <p className="muted">نفس العملاء المحسوبين في المؤشرات الرئيسية، موزعين حسب الفرع اللي استلم/سلّم شحناتهم. عدد العملاء في الفرع = العملاء اللي ليهم شحنات في الفرع ده في الشهر المقاس (العميل ممكن يظهر في أكتر من فرع، فمجموع العدد قد يزيد عن الإجمالي).</p>
    </>
  );
}

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
// To add a KPI: add an entry here (and a METRICS entry in src/lib/quality.js), then it appears in the sidebar,
// in «المؤشرات الرئيسية» and gets its own page.
const SECTIONS = [
  { id: 'overview', label: 'المؤشرات الرئيسية', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', sub: 'ملخص مؤشرات الأداء الرئيسية' },
  { id: 'delivery', metric: 'delivery', icon: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z' },
  { id: 'firstAttempt', metric: 'firstAttempt', icon: 'M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z' },
];
const sectionLabel = (x) => (x.metric ? METRICS[x.metric].label : x.label);
const sectionSub = (x) => (x.metric ? METRICS[x.metric].description : x.sub);

/** Everything computed for one KPI (metric) so every KPI page uses the same engine. */
function useMetricResults(data, metric, month, opts, hasBranches) {
  const available = !!data && metric.available(data.clients);
  const o = useMemo(() => ({ ...opts, metric }), [opts.method, opts.minShipments, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = useMemo(() => (available ? evaluateAllMonths(data.clients, data.months, o) : []), [data, available, o]);
  const result = useMemo(() => (available && month ? evaluateMonth(data.clients, month, o) : null), [data, available, month, o]);
  const branchRows = useMemo(() => (result && !result.error && hasBranches ? evaluateBranches(data.clients, data.branches, result) : []), [data, result, hasBranches]);
  return { available, trend, result: result && !result.error ? result : null, branchRows };
}

function MetricPage({ data, m, month, setMonth, hasBranches }) {
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
        <BranchesTable rows={branchRows} result={result} hasData={hasBranches} />
      </section>

      <section className="card">
        <h2>النتيجة شهر بشهر</h2>
        <TrendTable rows={trend} selected={month} onSelect={setMonth} />
      </section>

      <section className="card">
        <h2>تفصيل العملاء — {MONTH_AR[result.month]}</h2>
        <CustomersTable result={result} />
      </section>

      {metric.id === 'delivery' ? (
        <details className="card">
          <summary>مراجعة تصنيف الحالات (للتأكد من أن «دفع الشحن» محسوب صح)</summary>
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
        </details>
      ) : (
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
    بيانات First Attempt مش موجودة في رد السيرفر. السيرفر لسه على نسخة قديمة من <code>Code.gs</code>: حدّث الكود في Apps Script
    (من <code>apps-script-Code.gs</code>) واعمل Deploy جديد على نفس الـ Deployment، وبعدها حدّث الصفحة.
  </div>
);

export default function App() {
  const demo = new URLSearchParams(location.search).has('demo');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [month, setMonth] = useState('');
  const [method, setMethod] = useState('pooled');
  const [minShipments, setMin] = useState(1);
  const [section, setSection] = useState('overview');

  const load = () => {
    setLoading(true); setError('');
    (demo ? Promise.resolve(demoData()) : fetchClientMonthly())
      .then((d) => { setData(d); setUpdatedAt(new Date()); })
      .catch((e) => setError(e.message || String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const opts = useMemo(() => ({ method, minShipments }), [method, minShipments]);
  const hasBranches = !!(data && Array.isArray(data.branches) && data.clients.some((c) => c.b));
  const results = {
    delivery: useMetricResults(data, METRICS.delivery, month, opts, hasBranches),
    firstAttempt: useMetricResults(data, METRICS.firstAttempt, month, opts, hasBranches),
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
          {SECTIONS.map((x) => (
            <button key={x.id} role="tab" aria-selected={section === x.id} className={`nav-item ${section === x.id ? 'on' : ''}`} onClick={() => setSection(x.id)}>
              <Icon d={x.icon} /><span>{sectionLabel(x)}</span>
            </button>
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
            {monthShown && <span className="period">الشهر المقاس: <b>{MONTH_AR[monthShown]}</b></span>}
            <button className="btn" onClick={load} disabled={loading}>{loading ? 'جاري التحميل…' : 'تحديث'}</button>
          </div>
        </header>

        {demo && <div className="alert warn">⚠ بيانات تجريبية للمعاينة فقط (<code>?demo=1</code>) — مش أرقام ARRIVE الحقيقية.</div>}
        {error && <div className="alert err"><b>تعذر تحميل البيانات.</b> {error}</div>}
        {loading && !data && <div className="alert">جاري تحميل البيانات من Google Sheets… (أول مرة ممكن ياخد وقت)</div>}

        {data && (
          <>
            {(data.missingMonths?.length > 0 || data.skippedMonths?.length > 0) && (
              <div className="alert warn">
                شهور مفيهاش ملخص محفوظ (Snapshot) ومش داخلة في الحساب: {[...data.missingMonths, ...(data.skippedMonths || [])].map((m) => MONTH_AR[m]).join('، ')}.
                لتضمينها شغّل «تحديث الداش بورد» للشهر ده في الداش القديمة.
              </div>
            )}

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

            {!months.length && <div className="alert warn">مفيش شهر معاه 3 شهور سابقة متاحة. الشهور المتاحة: {data.months.map((m) => MONTH_AR[m]).join('، ') || 'لا يوجد'}.</div>}

            {section === 'overview' && months.length > 0 && SECTIONS.filter((x) => x.metric).map((x) => {
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

            {current.metric && cur && (!cur.available ? <NeedsUpdate /> : cur.result && (
              <MetricPage data={data} m={cur} month={month} setMonth={setMonth} hasBranches={hasBranches} />
            ))}
          </>
        )}
        <footer>ARRIVE — KPI Operation · المصدر: Google Sheets عبر Web App الداش بورد التشغيلية</footer>
      </main>
    </div>
  );
}
