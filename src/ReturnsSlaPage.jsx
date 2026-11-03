import React, { useEffect, useMemo, useState } from 'react';
import { fetchReturnsLive, fetchReturnsSnapshot } from './api.js';
import { RETURNS_SLA_URL } from './config.js';
import { demoReturns } from './demo.js';
import { Badge, Kpi } from './components.jsx';
import { levelFor } from './lib/quality.js';
import { AGE_BUCKETS, FLAGS, UNKNOWN, ageOf, comparableMonths, decodeReturns, evaluateReturnsMonth, filterReturns, groupStats, monthLabel, stats } from './lib/returnsSla.js';

const fmt = (n) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US'));
const f1 = (n) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 }));
const pctOf = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const dmy = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const byAr = (a, b) => a.localeCompare(b, 'ar');

function MultiSelect({ label, options, selected, onChange, placeholder }) {
  const [term, setTerm] = useState('');
  const list = options.filter((o) => !term || o.includes(term)).slice(0, 300);
  const toggle = (o) => { const s = new Set(selected); s.has(o) ? s.delete(o) : s.add(o); onChange(s); };
  return (
    <label className="ms-field">{label}
      <details className="ms">
        <summary>{selected.size ? `${[...selected].slice(0, 2).join('، ')}${selected.size > 2 ? ` +${selected.size - 2}` : ''}` : placeholder}</summary>
        <div className="ms-panel">
          <input placeholder="ابحث…" value={term} onChange={(e) => setTerm(e.target.value)} />
          {selected.size > 0 && <button type="button" className="link" onClick={() => onChange(new Set())}>مسح الاختيار</button>}
          {list.map((o) => (
            <label key={o} className="ms-option"><input type="checkbox" checked={selected.has(o)} onChange={() => toggle(o)} /> <span>{o}</span></label>
          ))}
        </div>
      </details>
    </label>
  );
}

function Bars({ items, color = 'var(--blue)', onPick, selected }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="hbars">
      {items.map((i) => (
        <div key={i.key} className={`hbar ${onPick ? 'click' : ''}`} onClick={onPick ? () => onPick(i.key) : undefined}>
          <span className="hbar-l">{i.label}</span>
          <span className="hbar-t"><span className="hbar-f" style={{ width: `${(i.value / max) * 100}%`, background: selected?.has(i.key) ? 'var(--teal, #00C7E6)' : i.color || color }} /></span>
          <span className="hbar-v">{i.text}</span>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ days }) {
  if (!days.length) return <p className="muted">مفيش مرتجعات مقفولة ضمن التصفية الحالية.</p>;
  const W = 720, H = 200, pad = 28, n = days.length;
  const maxC = Math.max(1, ...days.map((d) => d.rows)), maxA = Math.max(1, ...days.map((d) => d.avg || 0));
  const bw = (W - pad * 2) / n;
  const pts = days.map((d, i) => (d.avg == null ? null : [pad + bw * i + bw / 2, H - pad - (d.avg / maxA) * (H - pad * 2)]));
  const path = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="المرتجعات المقفلة يوميًا ومتوسط عمرها">
      {days.map((d, i) => {
        const h = (d.rows / maxC) * (H - pad * 2);
        return (
          <g key={d.key}>
            <rect x={pad + bw * i + bw * 0.15} y={H - pad - h} width={bw * 0.7} height={h} fill="var(--blue)" opacity=".85"><title>{`${dmy(d.key)} — ${fmt(d.rows)} مرتجع، متوسط العمر ${f1(d.avg)} يوم`}</title></rect>
            {(n <= 16 || i % Math.ceil(n / 12) === 0) && <text x={pad + bw * i + bw / 2} y={H - 8} fontSize="9" textAnchor="middle" fill="var(--gray)">{dmy(d.key).slice(0, 5)}</text>}
          </g>
        );
      })}
      <path d={path} fill="none" stroke="#00B5D1" strokeWidth="2.2" />
      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#00B5D1" />)}
      <text x="4" y="12" fontSize="10" fill="var(--blue)">أعمدة: عدد المرتجعات</text>
      <text x={W - 4} y="12" fontSize="10" textAnchor="end" fill="#00B5D1">خط: متوسط العمر (يوم) — الأقصى {f1(maxA)}</text>
    </svg>
  );
}

function SortTh({ k, sort, setSort, children }) {
  return (
    <th className="sortable" onClick={() => setSort(([sk, sd]) => [k, sk === k ? -sd : (k === 'key' || k === 'wb' ? 1 : -1)])}>
      {children}{sort[0] === k ? (sort[1] > 0 ? ' ▲' : ' ▼') : ''}
    </th>
  );
}
const cmp = (a, b, k, d) => {
  const x = a[k], y = b[k];
  if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
  return (typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'ar') : x - y) * d;
};

let CACHE = null; // decoded rows survive tab switches; the «تحديث» button reloads

/** Loads (live sheet → static snapshot fallback) and caches the decoded rows. Shared by the tab and by «المؤشرات الرئيسية». */
async function fetchAndCache(demo) {
  let j, source = 'live', warn = '';
  if (demo) { j = demoReturns(); source = 'demo'; }
  else {
    try { j = await fetchReturnsLive(); }
    catch (e) {
      const snap = await fetchReturnsSnapshot();
      if (!snap) throw e;
      j = snap; source = 'snap';
      warn = `تعذّر الاتصال بالشيت المباشر: ${e.message} — معروضة لقطة ثابتة.`;
    }
  }
  const decoded = decodeReturns(j), meta = { source, updatedAt: j.updatedAt };
  CACHE = { demo: !!demo, rows: decoded, meta, error: warn };
  return CACHE;
}

/** Cards for «المؤشرات الرئيسية»: the comparison of the latest comparable month, or the basic figures while there are not 3 previous months yet. */
export function ReturnsOverviewCards({ limit, levels, demo }) {
  const [state, setState] = useState(CACHE && CACHE.demo === !!demo ? CACHE : null);
  const [error, setError] = useState('');
  useEffect(() => { if (!state) fetchAndCache(demo).then(setState).catch((e) => setError(e.message || String(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = state?.rows;
  const age = useMemo(() => (r) => ageOf(r, 'written'), []);
  const months = useMemo(() => (rows ? comparableMonths(rows, age) : null), [rows, age]);
  const month = months?.comparable[months.comparable.length - 1];
  const ev = useMemo(() => (rows && month ? evaluateReturnsMonth(rows, month, age, levels, levelFor) : null), [rows, month, age, levels]);
  const T = useMemo(() => (rows ? stats(rows, age, limit) : null), [rows, age, limit]);
  if (error) return <div className="alert err"><b>تعذر تحميل بيانات SLA المرتجعات.</b> {error}</div>;
  if (!rows) return <div className="alert">جاري تحميل بيانات SLA المرتجعات…</div>;
  if (ev?.group) {
    const g = ev.group;
    return (
      <section className="kpis">
        <Kpi title="متوسط عمر المرتجع — آخر 3 شهور" value={`${f1(g.baseline)} يوم`} sub={ev.prev.map(monthLabel).join(' + ')} />
        <Kpi title={`متوسط عمر المرتجع — ${monthLabel(ev.month)}`} value={`${f1(g.current)} يوم`} tone="brand" sub={`${fmt(g.nCur)} مرتجع`} />
        <Kpi title="التحسن" value={`${g.improvement > 0 ? '+' : ''}${g.improvement.toFixed(3)} يوم`} tone={g.improvement >= 0 ? 'good' : 'bad'} sub="الموجب = أسرع من متوسط الـ3 شهور" />
        <div className={`kpi verdict ${g.level ? `lv-${g.level.key}` : ''}`}>
          <div className="kpi-title">التقييم</div>
          <div className="kpi-value"><Badge level={g.level} /></div>
          <div className="kpi-sub">{levels.slice(0, 3).reverse().map((l) => `${l.label} ≥ ${l.minDelta}`).join(' · ')} يوم أسرع</div>
        </div>
      </section>
    );
  }
  return (
    <>
      <div className="alert warn">
        مفيش شهر معاه 3 شهور سابقة في شيت Sla RTO (المتاح: {months.present.length ? months.present.map(monthLabel).join('، ') : 'لا يوجد'})، فبتظهر أرقام الشيت الحالية من غير مقارنة.
      </div>
      <section className="kpis">
        <Kpi title="عدد المرتجعات" value={fmt(T.rows)} sub={`${fmt(new Set(rows.map((r) => r.wb)).size)} بوليصة مميزة`} />
        <Kpi title="متوسط عمر المرتجع (يوم)" value={f1(T.avg)} tone="brand" sub={`الوسيط ${f1(T.med)} · الأقصى ${fmt(T.max)}`} />
        <Kpi title="داخل حد الـ SLA" value={limit == null ? '—' : pctOf(T.rate)} tone={limit == null ? '' : 'good'} sub={limit == null ? 'حدّد حد الـ SLA من الإعدادات' : `${fmt(T.within)} من ${fmt(T.n)}`} />
      </section>
    </>
  );
}

export default function ReturnsSlaPage({ limit, demo, levels }) {
  const [rows, setRows] = useState(CACHE?.rows || null);
  const [meta, setMeta] = useState(CACHE?.meta || { source: '', updatedAt: null });
  const [error, setError] = useState(CACHE?.error || '');
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({ q: '', branches: new Set(), statuses: new Set(), senders: new Set(), from: '', to: '', dup: 'all' });
  const [mode, setMode] = useState('written');
  const [brSort, setBrSort] = useState(['rows', -1]);
  const [sdSort, setSdSort] = useState(['rows', -1]);
  const [logSort, setLogSort] = useState(['ret', -1]);
  const [page, setPage] = useState(1);
  const [cmpMonth, setCmpMonth] = useState('');
  const size = 25;

  const load = async () => {
    setLoading(true); setError('');
    try {
      const c = await fetchAndCache(demo);
      setRows(c.rows); setMeta(c.meta); setError(c.error);
    } catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (!CACHE || CACHE.demo !== !!demo) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
  const age = useMemo(() => (r) => ageOf(r, mode), [mode]);
  const cur = useMemo(() => (rows ? filterReturns(rows, f) : []), [rows, f]);
  const T = useMemo(() => stats(cur, age, limit), [cur, age, limit]);
  const options = useMemo(() => ({
    branch: [...new Set((rows || []).map((r) => r.branch))].sort(byAr),
    status: [...new Set((rows || []).map((r) => r.status))].sort(byAr),
    sender: [...new Set((rows || []).map((r) => r.sender))].sort(byAr),
  }), [rows]);
  const branches = useMemo(() => groupStats(cur, 'branch', age, limit), [cur, age, limit]);
  const senders = useMemo(() => groupStats(cur, 'sender', age, limit), [cur, age, limit]);
  const days = useMemo(() => groupStats(cur.filter((r) => r.ret), 'ret', age, limit).sort((a, b) => a.key.localeCompare(b.key)), [cur, age, limit]);
  const dist = useMemo(() => AGE_BUCKETS.map(([label, fn]) => ({ key: label, label, value: T.ages.filter(fn).length, text: fmt(T.ages.filter(fn).length), color: limit != null && T.ages.filter(fn).some((a) => a > limit) ? '#EF4444' : undefined })), [T, limit]);
  const flagCounts = useMemo(() => { const c = {}; cur.forEach((r) => r.flags.forEach((x) => { c[x] = (c[x] || 0) + 1; })); return c; }, [cur]);
  const W = useMemo(() => stats(cur, (r) => (r.noDate ? null : r.ageS), limit), [cur, limit]);
  const C = useMemo(() => stats(cur, (r) => (r.noDate ? null : r.ageC), limit), [cur, limit]);
  const log = useMemo(() => {
    const t = cur.map((r) => ({ ...r, age: age(r), nflags: r.flags.length }));
    return t.sort((a, b) => cmp(a, b, logSort[0], logSort[1]) || a.id - b.id);
  }, [cur, age, logSort]);
  const pages = Math.max(1, Math.ceil(log.length / size));
  const pg = Math.min(page, pages);

  // Comparison (3 previous months vs the chosen month): all return rows after the page filters, ignoring the date range filter, no customer split.
  const cmpRows = useMemo(() => (rows ? filterReturns(rows, { ...f, from: '', to: '' }) : []), [rows, f]);
  const months = useMemo(() => comparableMonths(cmpRows, age), [cmpRows, age]);
  const chosen = months.comparable.includes(cmpMonth) ? cmpMonth : (months.comparable[months.comparable.length - 1] || '');
  const compare = useMemo(() => (chosen ? evaluateReturnsMonth(cmpRows, chosen, age, levels, levelFor) : null), [cmpRows, chosen, age, levels]);

  const active = (f.q.trim() ? 1 : 0) + f.branches.size + f.statuses.size + f.senders.size + (f.from ? 1 : 0) + (f.to ? 1 : 0) + (f.dup !== 'all' ? 1 : 0);
  const reset = () => set({ q: '', branches: new Set(), statuses: new Set(), senders: new Set(), from: '', to: '', dup: 'all' });
  const pick = (field, key) => { const s = new Set(f[field]); s.has(key) ? s.delete(key) : s.add(key); set({ [field]: s }); };

  if (error && !rows) return <div className="alert err"><b>تعذر تحميل بيانات SLA المرتجعات.</b> {error}</div>;
  if (!rows) return <div className="alert">{loading ? 'جاري تحميل بيانات SLA المرتجعات من شيت Sla RTO… (أول مرة ممكن ياخد وقت)' : '—'}</div>;

  const brRows = [...branches].sort((a, b) => cmp(a, b, brSort[0], brSort[1]) || byAr(a.key, b.key));
  const sdRows = [...senders].sort((a, b) => cmp(a, b, sdSort[0], sdSort[1]) || byAr(a.key, b.key));
  const brBars = branches.filter((b) => b.avg != null).sort((a, b) => b.avg - a.avg).map((b) => ({ key: b.key, label: `${b.key} (${fmt(b.rows)})`, value: b.avg, text: f1(b.avg) }));
  const verdict = (a) => (limit == null || a == null ? <span className="muted">—</span> : <span className={`badge ${a <= limit ? 'lv-excellent' : 'lv-below'}`}>{a <= limit ? 'داخل الحد' : 'خارج الحد'}</span>);

  return (
    <>
      {error && <div className="alert warn">{error}</div>}
      <section className="controls">
        <label>بحث (رقم البوليصة أو الراسل)
          <input placeholder="اكتب للبحث…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <MultiSelect label="فرع المرتجع" options={options.branch} selected={f.branches} onChange={(s) => set({ branches: s })} placeholder="كل الفروع" />
        <MultiSelect label="حالة الشحنة" options={options.status} selected={f.statuses} onChange={(s) => set({ statuses: s })} placeholder="كل الحالات" />
        <MultiSelect label="الراسل" options={options.sender} selected={f.senders} onChange={(s) => set({ senders: s })} placeholder="كل الراسلين" />
        <label>تقفيل المرتجع من<input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label>تقفيل المرتجع إلى<input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
        <label>البوليصات المتكررة
          <select value={f.dup} onChange={(e) => set({ dup: e.target.value })}>
            <option value="all">كل الصفوف (كما في الشيت)</option><option value="last">آخر ظهور لكل بوليصة</option><option value="first">أول ظهور لكل بوليصة</option>
          </select>
        </label>
        <label>أساس حساب العمر
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="written">كما في عمود الشيت</option><option value="calc">محسوب من التواريخ</option>
          </select>
        </label>
        <div className="ctl-actions">
          <span className="muted">{fmt(cur.length)} من {fmt(rows.length)} صف · فلاتر نشطة: {active}</span>
          <button className="btn ghost" style={{ marginTop: 0 }} onClick={reset} disabled={!active}>مسح الفلاتر</button>
          <button className="btn" onClick={load} disabled={loading}>{loading ? 'جاري التحميل…' : 'تحديث'}</button>
        </div>
      </section>
      <p className="muted" style={{ marginTop: -6 }}>
        المصدر: {meta.source === 'live' ? 'مباشر من شيت Sla RTO' : meta.source === 'demo' ? 'بيانات تجريبية' : 'لقطة ثابتة'}
        {meta.updatedAt ? ` — ${dmy(String(meta.updatedAt).slice(0, 10))}` : ''}. عمر المرتجع = تاريخ تقفيل المرتجع − تاريخ تقفيل الشحنة.
      </p>

      <section className="card">
        <h2>مقارنة SLA المرتجعات — آخر 3 شهور مقابل الشهر المختار</h2>
        <p className="muted">
          من غير تقسيم على العملاء: كل صفوف الشيت (بعد الفلاتر ما عدا التاريخ). الشهر = شهر «تاريخ تقفيل المرتجع».
          التحسن = متوسط عمر المرتجع في الـ3 شهور السابقة − متوسط الشهر المختار (النقص تحسّن). المقاييس من الإعدادات:
          {' '}{levels.slice(0, 3).reverse().map((l) => `${l.label} ≥ ${l.minDelta}`).join(' · ')} يوم أسرع.
        </p>
        {!months.comparable.length ? (
          <div className="alert warn">
            مفيش شهر معاه 3 شهور سابقة في البيانات الحالية.
            {' '}الشهور المتاحة (بتاريخ تقفيل المرتجع): {months.present.length ? months.present.map(monthLabel).join('، ') : 'لا يوجد'}.
            {' '}المقارنة هتشتغل أول ما تتوفر 3 شهور قبل الشهر المطلوب في شيت Sla RTO.
          </div>
        ) : (
          <>
            <div className="controls" style={{ boxShadow: 'none', padding: 0, border: 0 }}>
              <label>الشهر المقاس
                <select value={chosen} onChange={(e) => setCmpMonth(e.target.value)}>
                  {months.comparable.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
                </select>
              </label>
            </div>
            {compare?.group ? (
              <>
                <section className="kpis">
                  <Kpi title="متوسط عمر المرتجع — آخر 3 شهور" value={`${f1(compare.group.baseline)} يوم`} sub={`${compare.prev.map(monthLabel).join(' + ')} · ${fmt(compare.group.nBase)} مرتجع`} />
                  <Kpi title={`متوسط عمر المرتجع — ${monthLabel(compare.month)}`} value={`${f1(compare.group.current)} يوم`} tone="brand" sub={`${fmt(compare.group.nCur)} مرتجع`} />
                  <Kpi title="التحسن" value={`${compare.group.improvement > 0 ? '+' : ''}${compare.group.improvement.toFixed(3)} يوم`} tone={compare.group.improvement >= 0 ? 'good' : 'bad'} sub="الموجب = أسرع من متوسط الـ3 شهور" />
                  <div className={`kpi verdict ${compare.group.level ? `lv-${compare.group.level.key}` : ''}`}>
                    <div className="kpi-title">التقييم</div>
                    <div className="kpi-value"><Badge level={compare.group.level} /></div>
                    <div className="kpi-sub">{levels.slice(0, 3).reverse().map((l) => `${l.label} ≥ ${l.minDelta}`).join(' · ')} يوم أسرع</div>
                  </div>
                </section>
                <h3 className="sub-h">الفروع — {monthLabel(compare.month)} ({fmt(compare.branches.length)} فرع)</h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>الفرع</th><th>متوسط الـ3 شهور (يوم)</th><th>{monthLabel(compare.month)} (يوم)</th><th>التحسن (يوم)</th><th>التقييم</th><th>مرتجعات الشهر</th></tr></thead>
                  <tbody>
                    {[...compare.branches].sort((a, b) => b.improvement - a.improvement).map((b) => (
                      <tr key={b.branch}>
                        <td>{b.branch}</td><td className="n">{f1(b.baseline)}</td><td className="n"><b>{f1(b.current)}</b></td>
                        <td className="n">{b.improvement > 0 ? '+' : ''}{b.improvement.toFixed(3)}</td><td><Badge level={b.level} /></td><td className="n">{fmt(b.nCur)}</td>
                      </tr>
                    ))}
                    {!compare.branches.length && <tr><td colSpan="6" className="muted center">مفيش فرع ليه مرتجعات في الـ3 شهور السابقة والشهر المقاس</td></tr>}
                  </tbody>
                </table></div>
              </>
            ) : <div className="alert warn">مفيش مرتجعات ليها عمر في الشهر أو في الـ3 شهور السابقة ضمن الفلاتر الحالية.</div>}
          </>
        )}
      </section>

      <section className="kpis">
        <Kpi title="عدد المرتجعات" value={fmt(T.rows)} sub={`${fmt(new Set(cur.map((r) => r.wb)).size)} بوليصة مميزة`} />
        <Kpi title="متوسط عمر المرتجع (يوم)" value={f1(T.avg)} tone="brand" sub={`الوسيط ${f1(T.med)} · الأقصى ${fmt(T.max)} · بلا عمر: ${fmt(T.rows - T.n)}`} />
        <Kpi title="داخل حد الـ SLA" value={limit == null ? '—' : pctOf(T.rate)} tone={limit == null ? '' : 'good'} sub={limit == null ? 'حدّد حد الـ SLA من الإعدادات' : `${fmt(T.within)} من ${fmt(T.n)} (العمر ≤ ${limit} يوم)`} />
        <Kpi title="خارج حد الـ SLA" value={limit == null ? '—' : fmt(T.late)} tone={limit == null ? '' : 'bad'} sub={limit == null ? 'لا يُحكم قبل تحديد الحد' : `العمر > ${limit} يوم`} />
        <Kpi title="صفوف عليها ملاحظة جودة" value={fmt(cur.filter((r) => r.flags.length).length)} sub={cur.length ? `${pctOf(cur.filter((r) => r.flags.length).length / cur.length)} من الصفوف المعروضة` : '—'} />
      </section>

      <section className="card">
        <h2>المرتجعات المقفلة يوميًا ومتوسط عمرها</h2>
        <DailyChart days={days} />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>توزيع عمر المرتجع</h2>
          <p className="muted">عدد المرتجعات في كل شريحة عمر (يوم){limit != null ? ' — الأحمر = فيه صفوف خارج الحد' : ''}</p>
          <Bars items={dist} />
        </section>
        <section className="card">
          <h2>متوسط العمر حسب الفرع</h2>
          <p className="muted">مرتبة بأعلى متوسط، والرقم بين القوسين عدد الصفوف. اضغط على فرع لتصفية الصفحة عليه.</p>
          <div className="scroll-y"><Bars items={brBars} selected={f.branches} onPick={(k) => pick('branches', k)} /></div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>الملاحظات المكتشفة</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>الملاحظة</th><th>عدد الصفوف</th><th>المعنى</th></tr></thead>
            <tbody>
              {Object.keys(FLAGS).filter((x) => flagCounts[x]).map((x) => <tr key={x}><td>{FLAGS[x][0]}</td><td className="n">{fmt(flagCounts[x])}</td><td>{FLAGS[x][1]}</td></tr>)}
              {!Object.keys(flagCounts).length && <tr><td colSpan="3" className="muted center">لا توجد ملاحظات ضمن التصفية الحالية</td></tr>}
            </tbody>
          </table></div>
        </section>
        <section className="card">
          <h2>أثر أساس حساب العمر</h2>
          <p className="muted">نفس التصفية — اضغط على الصف لاختيار الأساس (المظلل هو الحالي).</p>
          <div className="table-wrap"><table>
            <thead><tr><th>الأساس</th><th>المتوسط</th><th>الوسيط</th><th>الأقصى</th><th>داخل الحد</th></tr></thead>
            <tbody>
              {[['written', 'كما في الشيت', W], ['calc', 'محسوب من التواريخ', C]].map(([m, lb, s]) => (
                <tr key={m} className={m === mode ? 'sel' : ''} style={{ cursor: 'pointer' }} onClick={() => setMode(m)}>
                  <td>{lb}</td><td className="n">{f1(s.avg)}</td><td className="n">{f1(s.med)}</td><td className="n">{fmt(s.max)}</td><td className="n">{limit == null ? '—' : pctOf(s.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted">{fmt(cur.filter((r) => !r.noDate && r.ageS != null && r.ageS !== r.ageC).length)} صف يختلف فيه عمر الشيت عن المحسوب (منها فرق اليوم الواحد لنفس اليوم).</p>
        </section>
      </div>

      <section className="card">
        <h2>أداء الفروع — {fmt(brRows.length)} فرع</h2>
        <div className="table-wrap"><table>
          <thead><tr>
            <SortTh k="key" sort={brSort} setSort={setBrSort}>الفرع</SortTh><SortTh k="rows" sort={brSort} setSort={setBrSort}>عدد الصفوف</SortTh>
            <SortTh k="avg" sort={brSort} setSort={setBrSort}>متوسط العمر</SortTh><SortTh k="med" sort={brSort} setSort={setBrSort}>الوسيط</SortTh>
            <SortTh k="max" sort={brSort} setSort={setBrSort}>الأقصى</SortTh><SortTh k="rate" sort={brSort} setSort={setBrSort}>داخل الحد</SortTh><th>التقييم</th>
          </tr></thead>
          <tbody>
            {brRows.map((b) => (
              <tr key={b.key} style={{ cursor: 'pointer' }} className={f.branches.has(b.key) ? 'sel' : ''} onClick={() => pick('branches', b.key)}>
                <td>{b.key}</td><td className="n">{fmt(b.rows)}</td><td className="n">{f1(b.avg)}</td><td className="n">{f1(b.med)}</td><td className="n">{fmt(b.max)}</td>
                <td className="n">{limit == null ? '—' : pctOf(b.rate)}</td><td>{verdict(b.avg)}</td>
              </tr>
            ))}
            {!brRows.length && <tr><td colSpan="7" className="muted center">مفيش نتائج</td></tr>}
          </tbody>
        </table></div>
        <p className="muted">«التقييم» = داخل الحد لو متوسط عمر الفرع ≤ حد الـ SLA المسجل في الإعدادات. الفرع «{UNKNOWN}» = مرتجعات خانة الفرع فيها فاضية أو فيها حالة.</p>
      </section>

      <section className="card">
        <h2>الراسلون — {fmt(sdRows.length)} راسل (أول 100)</h2>
        <div className="table-wrap"><table>
          <thead><tr>
            <SortTh k="key" sort={sdSort} setSort={setSdSort}>الراسل</SortTh><SortTh k="rows" sort={sdSort} setSort={setSdSort}>عدد الصفوف</SortTh>
            <SortTh k="avg" sort={sdSort} setSort={setSdSort}>متوسط العمر</SortTh><SortTh k="max" sort={sdSort} setSort={setSdSort}>الأقصى</SortTh>
            <SortTh k="rate" sort={sdSort} setSort={setSdSort}>داخل الحد</SortTh>
          </tr></thead>
          <tbody>
            {sdRows.slice(0, 100).map((b) => (
              <tr key={b.key} style={{ cursor: 'pointer' }} className={f.senders.has(b.key) ? 'sel' : ''} onClick={() => pick('senders', b.key)}>
                <td>{b.key}</td><td className="n">{fmt(b.rows)}</td><td className="n">{f1(b.avg)}</td><td className="n">{fmt(b.max)}</td><td className="n">{limit == null ? '—' : pctOf(b.rate)}</td>
              </tr>
            ))}
            {!sdRows.length && <tr><td colSpan="5" className="muted center">مفيش نتائج</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section className="card">
        <h2>السجل التفصيلي — {fmt(log.length)} صف</h2>
        <div className="table-wrap"><table>
          <thead><tr>
            <SortTh k="wb" sort={logSort} setSort={setLogSort}>رقم البوليصة</SortTh><SortTh k="sender" sort={logSort} setSort={setLogSort}>الراسل</SortTh>
            <SortTh k="branch" sort={logSort} setSort={setLogSort}>الفرع</SortTh><SortTh k="status" sort={logSort} setSort={setLogSort}>الحالة</SortTh>
            <SortTh k="pickup" sort={logSort} setSort={setLogSort}>البيك أب</SortTh><SortTh k="close" sort={logSort} setSort={setLogSort}>تقفيل الشحنة</SortTh>
            <SortTh k="ret" sort={logSort} setSort={setLogSort}>تقفيل المرتجع</SortTh><SortTh k="age" sort={logSort} setSort={setLogSort}>العمر (يوم)</SortTh>
            <th>SLA</th><SortTh k="tab" sort={logSort} setSort={setLogSort}>التاب</SortTh><SortTh k="nflags" sort={logSort} setSort={setLogSort}>ملاحظات</SortTh>
          </tr></thead>
          <tbody>
            {log.slice((pg - 1) * size, pg * size).map((r) => (
              <tr key={r.id}>
                <td className="n">{r.wb}</td><td>{r.sender}</td>
                <td>{r.branch}{r.branchRaw !== r.branch && r.branch !== UNKNOWN ? <span className="muted" title="الاسم في الشيت"> ({r.branchRaw})</span> : null}</td>
                <td>{r.status}</td><td className="n">{dmy(r.pickup)}</td><td className="n">{dmy(r.close)}</td><td className="n">{dmy(r.ret)}</td>
                <td className="n">{fmt(r.age)}</td><td>{verdict(r.age)}</td><td>{r.tab}</td>
                <td>{r.flags.map((x) => <span key={x} className="flag-pill" title={FLAGS[x][1]}>{FLAGS[x][0]}</span>)}</td>
              </tr>
            ))}
            {!log.length && <tr><td colSpan="11" className="muted center">لا توجد صفوف — غيّر الفلاتر</td></tr>}
          </tbody>
        </table></div>
        <div className="pager">
          <button className="btn ghost" style={{ marginTop: 0 }} disabled={pg <= 1} onClick={() => setPage(pg - 1)}>السابق</button>
          <span className="muted">{pg} / {pages}</span>
          <button className="btn ghost" style={{ marginTop: 0 }} disabled={pg >= pages} onClick={() => setPage(pg + 1)}>التالي</button>
        </div>
      </section>
    </>
  );
}
