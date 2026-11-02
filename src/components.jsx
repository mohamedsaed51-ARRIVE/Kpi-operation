import React, { useMemo, useState } from 'react';
import { managementSummary } from './lib/summary.js';
import { MONTH_AR, thresholdsText } from './lib/quality.js';
import { targetFor, meetsTarget } from './lib/targets.js';

export const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${v.toFixed(d)}%`);
export const pts = (v, d = 2) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)} نقطة`);
export const pp = (v, d = 2) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
export const num = (v) => (v ?? 0).toLocaleString('en-US');
export const ICON = { excellent: '★', required: '✔', acceptable: '◐', below: '✖' };

export function Badge({ level }) {
  if (!level) return <span className="muted">—</span>;
  return <span className={`badge lv-${level.key}`}><span aria-hidden>{ICON[level.key]}</span> {level.label}</span>;
}

export function Kpi({ title, value, sub, tone }) {
  return (
    <div className={`kpi ${tone ? `tone-${tone}` : ''}`}>
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/** Baseline bars + average line + the 3 / 5 / 7 point target lines. */
export function BaselineChart({ result }) {
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

export function TrendTable({ rows, selected, onSelect }) {
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

export function CustomersTable({ result }) {
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

export function SummaryBox({ text }) {
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

export function KpiCards({ result }) {
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

function TargetCells({ current, target }) {
  const met = meetsTarget(current, target);
  return (
    <>
      <td className="n">{target === null ? <span className="muted">—</span> : pct(target)}</td>
      <td>
        {met === null ? <span className="muted">لم يُحدد تارجت</span>
          : met ? <span className="badge lv-excellent">✔ محقق</span>
            : <span className="badge lv-below">✖ لم يتحقق ({pp(current - target)})</span>}
      </td>
    </>
  );
}

export function BranchesTable({ rows, result, hasData, targets }) {
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
              <th>التارجت</th>
              <th>تحقيق التارجت</th>
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
                <TargetCells current={r.current} target={targetFor(targets, result.metric.id, r.branch)} />
                <td className="n">{num(r.curTotal)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan="9" className="muted center">مفيش نتائج</td></tr>}
          </tbody>
          {list.length > 0 && (
            <tfoot><tr><td><b>الإجمالي</b></td><td className="n">{num(result.group.customers)}</td><td className="n">{pct(result.group.baseline)}</td><td className="n"><b>{pct(result.group.current)}</b></td><td className="n">{pp(result.group.delta)}</td><td><Badge level={result.group.level} /></td><td>—</td><td>—</td><td className="n">{num(tot.t)}</td></tr></tfoot>
          )}
        </table>
      </div>
      <p className="muted">نفس العملاء المحسوبين في المؤشرات الرئيسية، موزعين حسب الفرع اللي استلم/سلّم شحناتهم. عدد العملاء في الفرع = العملاء اللي ليهم شحنات في الفرع ده في الشهر المقاس (العميل ممكن يظهر في أكتر من فرع، فمجموع العدد قد يزيد عن الإجمالي).</p>
    </>
  );
}

