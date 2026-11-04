import React, { useEffect, useMemo, useState } from 'react';
import { fetchComplaintsRaw } from './api.js';
import { Kpi, num } from './components.jsx';
import { ALL_MONTHS, bearerSummary, countBy, csvText, decodeComplaints, filterMonth, isOpen, monthsOf, sumAmount } from './lib/complaints.js';

const DETAIL_LIMIT = 300;
const GROUPS = [['type', 'النوع'], ['branch', 'الفرع'], ['classification', 'التصنيف'], ['status', 'الحالة']];
const pctOf = (n, t) => (t ? `${(Math.round((n / t) * 1000) / 10).toFixed(1)}%` : '—');

function download(name, headers, lines) {
  const url = URL.createObjectURL(new Blob([csvText(headers, lines)], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

export default function ComplaintsPage({ demo }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('comp');
  const [month, setMonth] = useState(ALL_MONTHS);

  const load = () => {
    setLoading(true); setError('');
    fetchComplaintsRaw().then((r) => setRows(decodeComplaints(r))).catch((e) => setError(e.message || String(e))).finally(() => setLoading(false));
  };
  useEffect(() => { if (!demo) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const months = useMemo(() => (rows ? monthsOf(rows) : []), [rows]);
  const view = useMemo(() => (rows ? filterMonth(rows, month) : []), [rows, month]);
  const total = view.length;
  const sum = useMemo(() => sumAmount(view), [view]);
  const bearers = useMemo(() => bearerSummary(view), [view]);

  if (demo) return <div className="alert warn">صفحة الشكاوى والتعويضات بتقرأ من الداش الحقيقية فقط (مفيش بيانات تجريبية).</div>;
  if (error) return <div className="alert err"><b>تعذر تحميل بيانات الشكاوى.</b> {error} <button className="btn" onClick={load}>إعادة المحاولة</button></div>;
  if (!rows) return <div className="alert">جاري تحميل بيانات الشكاوى…</div>;

  return (
    <>
      <section className="controls">
        <label>الشهر
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value={ALL_MONTHS}>كل الشهور</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <button className="btn" onClick={load} disabled={loading}>{loading ? 'جاري التحميل…' : 'تحديث'}</button>
      </section>

      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'comp'} className={`seg-btn ${tab === 'comp' ? 'on' : ''}`} onClick={() => setTab('comp')}>التعويضات المتحملة والجهة</button>
        <button role="tab" aria-selected={tab === 'cmp'} className={`seg-btn ${tab === 'cmp' ? 'on' : ''}`} onClick={() => setTab('cmp')}>عدد الشكاوى وتفصيلها</button>
      </div>

      {tab === 'comp' && (
        <section className="card">
          <div className="kpis">
            <Kpi title="إجمالي التعويض (ج.م)" value={num(sum)} />
            <Kpi title="عدد الشكاوى" value={num(total)} />
            <Kpi title="عدد الجهات المتحملة" value={num(bearers.length)} />
          </div>
          <div className="head-actions" style={{ margin: '10px 0' }}>
            <button className="btn" onClick={() => download('compensation_by_bearer', ['الجهة المتحملة', 'إجمالي التعويض', '% من الإجمالي', 'عدد الشكاوى', 'حالات بتعويض'], bearers.map((o) => [o.bearer, o.amount, pctOf(o.amount, sum), o.complaints, o.compensated]))}>تصدير CSV</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الجهة المتحملة</th><th>إجمالي التعويض (ج.م)</th><th>% من الإجمالي</th><th>عدد الشكاوى</th><th>حالات بتعويض</th></tr></thead>
              <tbody>
                {bearers.map((o) => <tr key={o.bearer}><td>{o.bearer}</td><td>{num(o.amount)}</td><td>{pctOf(o.amount, sum)}</td><td>{num(o.complaints)}</td><td>{num(o.compensated)}</td></tr>)}
                {!bearers.length && <tr><td colSpan="5">لا توجد بيانات</td></tr>}
              </tbody>
              <tfoot><tr><td><b>الإجمالي</b></td><td><b>{num(sum)}</b></td><td><b>{sum ? '100.0%' : '—'}</b></td><td><b>{num(total)}</b></td><td><b>{num(bearers.reduce((t, o) => t + o.compensated, 0))}</b></td></tr></tfoot>
            </table>
          </div>
          <p className="muted">الشكاوى بدون جهة متحملة بتظهر في «غير محدد». المصدر: داش بورد الشكاوى (قراءة فقط).</p>
        </section>
      )}

      {tab === 'cmp' && (
        <>
          <section className="card">
            <div className="kpis">
              <Kpi title="إجمالي الشكاوى" value={num(total)} />
              <Kpi title="مفتوحة" value={num(view.filter(isOpen).length)} />
              <Kpi title="بتعويض" value={num(view.filter((r) => (r.amount || 0) > 0).length)} />
            </div>
            <div className="head-actions" style={{ margin: '10px 0' }}>
              <button className="btn" onClick={() => download('complaints_summary', ['البعد', 'القيمة', 'العدد', '%'], GROUPS.flatMap(([k, l]) => countBy(view, k).map((x) => [l, x.name, x.count, pctOf(x.count, total)])))}>تصدير التجميع</button>
              <button className="btn" onClick={() => download('complaints_detail', ['رقم الشكوى', 'التاريخ', 'الفرع', 'النوع', 'التصنيف', 'الحالة', 'الجهة المتحملة', 'التعويض'], view.map((r) => [r.id, r.date, r.branch, r.type, r.classification, r.status, r.bearer, r.amount ?? '']))}>تصدير التفصيل</button>
            </div>
          </section>
          {GROUPS.map(([k, label]) => (
            <section className="card" key={k}>
              <h2>حسب {label}</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{label}</th><th>العدد</th><th>%</th></tr></thead>
                  <tbody>{countBy(view, k).map((x) => <tr key={x.name}><td>{x.name}</td><td>{num(x.count)}</td><td>{pctOf(x.count, total)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          ))}
          <section className="card">
            <h2>تفصيل الشكاوى</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>رقم الشكوى</th><th>التاريخ</th><th>الفرع</th><th>النوع</th><th>التصنيف</th><th>الحالة</th><th>الجهة المتحملة</th><th>التعويض (ج.م)</th></tr></thead>
                <tbody>
                  {view.slice(0, DETAIL_LIMIT).map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.date || '—'}</td><td>{r.branch}</td><td>{r.type}</td><td>{r.classification}</td><td>{r.status}</td><td>{r.bearer}</td><td>{r.amount == null ? '—' : num(r.amount)}</td></tr>)}
                </tbody>
              </table>
            </div>
            {total > DETAIL_LIMIT && <p className="muted">معروض أول {DETAIL_LIMIT} شكوى من {num(total)} — التصدير يشمل الكل.</p>}
          </section>
        </>
      )}
    </>
  );
}
