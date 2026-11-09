import React, { useEffect, useMemo, useState } from 'react';
import { fetchComplaintsRaw } from './api.js';
import { Kpi, num } from './components.jsx';
import { ALL_MONTHS, COMP_SLA_TARGET_DAYS, PENDING_TARGET_PCT, RES_SLA_TARGET_DAYS, bearerSummary, countBy, csvText, decodeComplaints, filterMonth, isOpen, latestMonth, monthsOf, overviewStats, sumAmount } from './lib/complaints.js';

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

/** كارت «المؤشرات الرئيسية»: مؤشر الشكاوى + مؤشر التعويضات (+ المفقود والتالف) لآخر شهر مع إجمالي كل الشهور. */
export function ComplaintsOverviewCards() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  // فلتر شهر مستقل لكل مؤشر (الشكاوى / التعويضات)؛ الافتراضي آخر شهر.
  const [mC, setMC] = useState('');
  const [mK, setMK] = useState('');
  useEffect(() => { fetchComplaintsRaw().then((r) => setRows(decodeComplaints(r))).catch((e) => setError(e.message || String(e))); }, []);
  const months = useMemo(() => (rows ? monthsOf(rows) : []), [rows]);
  const latest = useMemo(() => (rows ? latestMonth(rows) : null), [rows]);
  const monthC = months.includes(mC) ? mC : latest;
  const monthK = months.includes(mK) ? mK : latest;
  const curC = useMemo(() => (rows ? filterMonth(rows, monthC) : []), [rows, monthC]);
  const curK = useMemo(() => (rows ? filterMonth(rows, monthK) : []), [rows, monthK]);
  const st = useMemo(() => overviewStats(curC), [curC]);
  const stK = useMemo(() => overviewStats(curK), [curK]);
  const all = useMemo(() => (rows ? overviewStats(rows) : null), [rows]);
  const OCT = 'أكتوبر';
  const oct = useMemo(() => (rows ? overviewStats(filterMonth(rows, OCT)) : null), [rows]);
  const prevMonth = months.indexOf(monthC) > 0 ? months[months.indexOf(monthC) - 1] : null;
  const prev = useMemo(() => (rows && prevMonth ? overviewStats(filterMonth(rows, prevMonth)) : null), [rows, prevMonth]);
  const sgn = (v, d = 0) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
  const top = useMemo(() => bearerSummary(curK).find((o) => o.amount > 0), [curK]);
  if (error) return <div className="alert err"><b>تعذر تحميل بيانات الشكاوى.</b> {error}</div>;
  if (!rows) return <div className="alert">جاري تحميل بيانات الشكاوى…</div>;
  if (!rows.length || !latest) return <div className="alert warn">مفيش شكاوى متاحة.</div>;
  const pick = (v, set) => (
    <label className="month-select">الشهر
      <select value={v} onChange={(e) => set(e.target.value)}>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
    </label>
  );
  const f1 = (v) => (v === null ? '—' : `${(Math.round(v * 10) / 10).toFixed(1)}`);
  const sla = (o) => (o.pct === null ? '—' : `${Math.round(o.pct)}%`);
  const pendPct = st.total ? (st.investigating / st.total) * 100 : 0;
  return (
    <>
      <div className="sub-row"><h3 className="sub-head">مؤشر الشكاوى</h3>{pick(monthC, setMC)}</div>
      <section className="kpis">
        <Kpi title="إجمالي الشكاوى" value={num(st.total)} tone="brand" sub={`إجمالي كل الشهور ${num(all.total)}`} />
        <Kpi title="نسبة قبول التعويض" value={pctOf(st.accepted, st.decided)} sub={`${num(st.accepted)} مقبولة من ${num(st.decided)} حالة تم البتّ فيها · كل الشهور ${all.acceptRate === null ? '—' : `${f1(all.acceptRate)}%`}`} />
        <Kpi title="قيد التحقيق" value={num(st.investigating)} tone={pendPct <= PENDING_TARGET_PCT ? 'good' : 'bad'} sub={`${f1(pendPct)}% من الإجمالي · الهدف أقل من ${PENDING_TARGET_PCT}%`} />
        <Kpi title="الشكاوى المفتوحة" value={num(st.open)} tone={st.open ? 'bad' : 'good'} sub={`قيد التحقيق + مراجعة/رد الشكاوي/معلقة · كل الشهور ${num(all.open)}`} />
        <Kpi title="الالتزام بـ SLA التحقيق" value={sla(st.resSla)} sub={`متوسط زمن الحل ${f1(st.resSla.avg)} يوم · الهدف ${RES_SLA_TARGET_DAYS} أيام · ${num(st.resSla.count)} حالة`} />
        <Kpi title="الالتزام بـ SLA التعويض" value={sla(st.compSla)} sub={`متوسط زمن التنفيذ ${f1(st.compSla.avg)} يوم · الهدف ${COMP_SLA_TARGET_DAYS} يوم من النتيجة · ${num(st.compSla.count)} حالة`} />
      </section>
      {monthC !== OCT && oct && oct.total > 0 && (
        <section className="kpis" style={{ marginTop: 14 }}>
          <Kpi title={`مقارنة ${monthC} بأكتوبر — عدد الشكاوى`} value={sgn(st.total - oct.total)} tone={st.total <= oct.total ? 'good' : 'bad'} sub={`${num(st.total)} في ${monthC} مقابل ${num(oct.total)} في أكتوبر`} />
        </section>
      )}
      {prev && prev.acceptRate !== null && st.acceptRate !== null && (
        <section className="kpis" style={{ marginTop: 14 }}>
          <Kpi title={`مقارنة نسبة قبول التعويض بـ${prevMonth}`} value={`${sgn(st.acceptRate - prev.acceptRate, 1)} نقطة`} sub={`${f1(st.acceptRate)}% في ${monthC} مقابل ${f1(prev.acceptRate)}% في ${prevMonth} · ${st.acceptRate > prev.acceptRate ? 'أعلى من الشهر السابق' : st.acceptRate < prev.acceptRate ? 'أقل من الشهر السابق' : 'مساوية للشهر السابق'}`} />
        </section>
      )}
      <div className="sub-row"><h3 className="sub-head">مؤشر التعويضات</h3>{pick(monthK, setMK)}</div>
      <section className="kpis">
        <Kpi title="إجمالي التعويضات (ج.م)" value={num(stK.amount)} sub={`${num(stK.compensated)} حالة بتعويض · كل الشهور ${num(all.amount)}`} />
        <Kpi title="تعويضات الشركة (ج.م)" value={num(stK.companyAmount)} sub={`${num(stK.companyCount)} حالة · ${pctOf(stK.companyAmount, stK.amount)} من تعويضات الشهر · كل الشهور ${num(all.companyAmount)}`} />
        <Kpi title="أكبر جهة متحملة" value={top ? top.bearer : '—'} sub={top ? `${num(top.amount)} ج.م · ${pctOf(top.amount, stK.amount)} من تعويضات الشهر` : 'لا توجد تعويضات'} />
        <Kpi title="المفقود (شحنة/مرتجع)" value={num(stK.lost.count)} tone={stK.lost.count ? 'bad' : undefined} sub={`تعويض ${num(stK.lost.amount)} ج.م · كل الشهور ${num(all.lost.count)} شكوى`} />
        <Kpi title="التالف (شحنة هالكة)" value={num(stK.damaged.count)} tone={stK.damaged.count ? 'bad' : undefined} sub={`تعويض ${num(stK.damaged.amount)} ج.م · كل الشهور ${num(all.damaged.count)} شكوى`} />
      </section>
      {monthK !== OCT && oct && oct.total > 0 && (
        <section className="kpis" style={{ marginTop: 14 }}>
          <Kpi title={`مقارنة ${monthK} بأكتوبر — إجمالي التعويضات (ج.م)`} value={sgn(stK.amount - oct.amount)} tone={stK.amount <= oct.amount ? 'good' : 'bad'} sub={`${num(stK.amount)} في ${monthK} مقابل ${num(oct.amount)} في أكتوبر`} />
        </section>
      )}
    </>
  );
}
