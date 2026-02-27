'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function api(path, options = {}) {
  const r = await fetch(`${API}${path}`, options);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j?.errors?.[0]?.message || 'Request failed');
  return j;
}

export default function Page() {
  const [portfolios, setPortfolios] = useState([]);
  const [portfolioId, setPortfolioId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [combined, setCombined] = useState(null);
  const [positions, setPositions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [analyticsPeriod, setAnalyticsPeriod] = useState('1M');
  const [analytics, setAnalytics] = useState({ series: [], allocation: [], top_gainers: [], top_losers: [] });
  const [newPortfolio, setNewPortfolio] = useState('');
  const [renamePortfolio, setRenamePortfolio] = useState('');
  const [editTx, setEditTx] = useState(null);
  const [undoId, setUndoId] = useState(null);
  const [form, setForm] = useState({ ticker: '', transaction_type: 'BUY', quantity: '', price_per_share: '', fees: '0', executed_at: new Date().toISOString().slice(0,16), notes: '' });
  const [error, setError] = useState('');

  async function loadPortfolios() {
    const r = await api('/api/v1/portfolios');
    setPortfolios(r.data || []);
    if (!portfolioId && r.data?.length) {
      setPortfolioId(String(r.data[0].id));
      setRenamePortfolio(r.data[0].name);
    }
  }

  async function loadData(pid = portfolioId) {
    if (!pid) return;
    const q = `?portfolio_id=${pid}`;
    const [d, p, t, c, a, s, an] = await Promise.all([
      api(`/api/v1/dashboard${q}`),
      api(`/api/v1/positions${q}`),
      api(`/api/v1/transactions${q}`),
      api('/api/v1/dashboard/combined'),
      api('/api/v1/activity?limit=10'),
      api(`/api/v1/snapshots${q}&days=30`),
      api(`/api/v1/analytics${q}&period=${analyticsPeriod}`),
    ]);
    setDashboard(d.data);
    setPositions(p.data || []);
    setTransactions(t.data || []);
    setCombined(c.data || null);
    setActivity(a.data || []);
    setSnapshots(s.data || []);
    setAnalytics(an.data || { series: [], allocation: [], top_gainers: [], top_losers: [] });
  }

  useEffect(() => { loadPortfolios().catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (portfolioId) {
      const p = portfolios.find(x => String(x.id) === String(portfolioId));
      if (p) setRenamePortfolio(p.name);
      loadData(portfolioId).catch(e => setError(e.message));
    }
  }, [portfolioId, analyticsPeriod]);

  async function createPortfolio() {
    if (!newPortfolio.trim()) return;
    try {
      await api('/api/v1/portfolios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPortfolio.trim(), initial_cash: 0 })
      });
      setNewPortfolio('');
      await loadPortfolios();
      await loadData();
    } catch (e) { setError(e.message); }
  }

  async function renameSelectedPortfolio() {
    if (!renamePortfolio.trim() || !portfolioId) return;
    try {
      await api(`/api/v1/portfolios/${portfolioId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renamePortfolio.trim(), initial_cash: 0 })
      });
      await loadPortfolios();
      await loadData();
    } catch (e) { setError(e.message); }
  }

  async function deleteSelectedPortfolio() {
    if (!portfolioId) return;
    if (!confirm('Delete selected portfolio? If it has transactions, they will be archived.')) return;
    try {
      await api(`/api/v1/portfolios/${portfolioId}?force=true`, { method: 'DELETE' });
      const p = portfolios.filter(x => String(x.id) !== String(portfolioId));
      setPortfolios(p);
      setPortfolioId(p[0] ? String(p[0].id) : '');
      await loadPortfolios();
    } catch (e) { setError(e.message); }
  }

  async function submit(e) {
    e.preventDefault();
    try {
      await api(`/api/v1/transactions?portfolio_id=${portfolioId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          price_per_share: Number(form.price_per_share),
          fees: Number(form.fees || 0),
          executed_at: new Date(form.executed_at).toISOString(),
        })
      });
      setForm({ ...form, ticker: '', quantity: '', price_per_share: '', notes: '' });
      await loadData();
    } catch (e2) { setError(e2.message); }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editTx) return;
    try {
      await api(`/api/v1/transactions/${editTx.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: editTx.ticker,
          transaction_type: editTx.transaction_type,
          quantity: Number(editTx.quantity),
          price_per_share: Number(editTx.price_per_share),
          fees: Number(editTx.fees || 0),
          executed_at: new Date(editTx.executed_at).toISOString(),
          notes: editTx.notes || ''
        })
      });
      setEditTx(null);
      await loadData();
    } catch (e2) { setError(e2.message); }
  }

  async function deleteTx(id) {
    if (!confirm('Delete this transaction? You can undo right after.')) return;
    try {
      const res = await api(`/api/v1/transactions/${id}`, { method: 'DELETE' });
      setUndoId(res?.data?.undo_id || null);
      await loadData();
    } catch (e) { setError(e.message); }
  }

  async function undoDelete() {
    if (!undoId) return;
    try {
      await api(`/api/v1/transactions/undo-delete/${undoId}`, { method: 'POST' });
      setUndoId(null);
      await loadData();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="container grid" style={{gap: 24}}>
      <h1>Portfolio Tracker MVP</h1>

      {error && <div className="card neg">{error}</div>}
      {undoId && <div className="card">Transaction deleted. <button onClick={undoDelete}>Undo</button></div>}

      <div className="card grid grid-2">
        <div>
          <div style={{marginBottom: 8}}>Portfolio</div>
          <select value={portfolioId} onChange={e => setPortfolioId(e.target.value)}>
            {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <input value={renamePortfolio} onChange={e => setRenamePortfolio(e.target.value)} />
            <button onClick={renameSelectedPortfolio}>Rename</button>
            <button onClick={deleteSelectedPortfolio}>Delete</button>
          </div>
        </div>
        <div>
          <div style={{marginBottom: 8}}>Create Portfolio Group</div>
          <div style={{display:'flex', gap: 8}}>
            <input placeholder="401K / Personal / ESPP" value={newPortfolio} onChange={e => setNewPortfolio(e.target.value)} />
            <button onClick={createPortfolio}>Add</button>
          </div>
        </div>
      </div>

      {combined && (
        <div className="grid grid-3">
          <div className="card"><div>Combined Value</div><h2>${combined.total_value.toFixed(2)}</h2></div>
          <div className="card"><div>Combined P&L</div><h2 className={combined.unrealized_pnl >= 0 ? 'pos' : 'neg'}>${combined.unrealized_pnl.toFixed(2)} ({combined.unrealized_pnl_pct.toFixed(2)}%)</h2></div>
          <div className="card"><div>Portfolio Buckets</div><h3>{combined.by_portfolio.length}</h3></div>
        </div>
      )}

      {dashboard && (
        <div className="grid grid-3">
          <div className="card"><div>Selected Value</div><h2>${dashboard.total_value.toFixed(2)}</h2></div>
          <div className="card"><div>Selected P&L</div><h2 className={dashboard.unrealized_pnl >= 0 ? 'pos' : 'neg'}>${dashboard.unrealized_pnl.toFixed(2)} ({dashboard.unrealized_pnl_pct.toFixed(2)}%)</h2></div>
          <div className="card"><div>Benchmarks (1Y)</div><h3>SPY {dashboard.benchmark_spy_return_pct}% · QQQ {dashboard.benchmark_qqq_return_pct}%</h3></div>
        </div>
      )}

      <div className="card">
        <h2>30D Snapshot Trend</h2>
        <div style={{display:'flex', gap:6, alignItems:'end', minHeight:80}}>
          {snapshots.map((s, i) => {
            const max = Math.max(...snapshots.map(x => x.total_value), 1);
            const h = Math.max(8, Math.round((s.total_value / max) * 70));
            return <div key={i} title={`${s.date}: ${s.total_value}`} style={{width:8, height:h, background:'#3b82f6', borderRadius:4}} />;
          })}
        </div>
      </div>

      <div className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h2>Analytics</h2>
          <select value={analyticsPeriod} onChange={e => setAnalyticsPeriod(e.target.value)}>
            <option>1W</option><option>1M</option><option>3M</option><option>6M</option><option>1Y</option><option>ALL</option>
          </select>
        </div>
        <div className="grid grid-2">
          <div>
            <h3>P&L Curve</h3>
            <svg viewBox="0 0 420 140" style={{width:'100%', background:'#0f1727', border:'1px solid #334155', borderRadius:8}}>
              {(() => {
                const pts = analytics.series || [];
                if (!pts.length) return null;
                const min = Math.min(...pts.map(p => p.value));
                const max = Math.max(...pts.map(p => p.value));
                const span = Math.max(max - min, 1);
                const path = pts.map((p, i) => {
                  const x = (i / Math.max(pts.length - 1, 1)) * 400 + 10;
                  const y = 120 - ((p.value - min) / span) * 100;
                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).join(' ');
                return <path d={path} fill="none" stroke="#22c55e" strokeWidth="2" />;
              })()}
            </svg>
          </div>
          <div>
            <h3>Allocation</h3>
            {(analytics.allocation || []).slice(0, 8).map((a) => (
              <div key={a.ticker} style={{marginBottom:8}}>
                <div style={{display:'flex', justifyContent:'space-between'}}><span>{a.ticker}</span><span>{a.weight_pct}%</span></div>
                <div style={{height:8, background:'#1f2937', borderRadius:4}}><div style={{height:8, width:`${Math.min(100, a.weight_pct)}%`, background:'#3b82f6', borderRadius:4}} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-2" style={{marginTop: 12}}>
          <div>
            <h3>Top Gainers</h3>
            <ul>{(analytics.top_gainers || []).map(g => <li key={`g-${g.ticker}`}>{g.ticker}: <span className="pos">${g.unrealized_pnl} ({g.unrealized_pnl_pct}%)</span></li>)}</ul>
          </div>
          <div>
            <h3>Top Losers</h3>
            <ul>{(analytics.top_losers || []).map(l => <li key={`l-${l.ticker}`}>{l.ticker}: <span className="neg">${l.unrealized_pnl} ({l.unrealized_pnl_pct}%)</span></li>)}</ul>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Add Trade</h2>
        <form className="grid grid-2" onSubmit={submit}>
          <input placeholder="Ticker" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })} required />
          <select value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })}><option>BUY</option><option>SELL</option></select>
          <input type="number" step="0.000001" placeholder="Quantity" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required />
          <input type="number" step="0.0001" placeholder="Price/share" value={form.price_per_share} onChange={e => setForm({ ...form, price_per_share: e.target.value })} required />
          <input type="number" step="0.01" placeholder="Fees" value={form.fees} onChange={e => setForm({ ...form, fees: e.target.value })} />
          <input type="datetime-local" value={form.executed_at} onChange={e => setForm({ ...form, executed_at: e.target.value })} required />
          <input style={{gridColumn:'1 / span 2'}} placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <button type="submit" style={{gridColumn:'1 / span 2'}}>Add Transaction</button>
        </form>
      </div>

      <div className="card">
        <h2>Positions</h2>
        <table><thead><tr><th>Ticker</th><th>Qty</th><th>Avg Cost</th><th>Last Close</th><th>Value</th><th>P&L</th></tr></thead><tbody>
          {positions.map(p => (
            <tr key={p.ticker}><td>{p.ticker}</td><td>{p.quantity}</td><td>${p.avg_cost_basis}</td><td>${p.current_price}</td><td>${p.current_value}</td><td className={p.unrealized_pnl >= 0 ? 'pos':'neg'}>${p.unrealized_pnl} ({p.unrealized_pnl_pct}%)</td></tr>
          ))}
        </tbody></table>
      </div>

      <div className="card">
        <h2>Recent Transactions</h2>
        <table><thead><tr><th>Date</th><th>Ticker</th><th>Type</th><th>Qty</th><th>Price</th><th>Actions</th></tr></thead><tbody>
          {transactions.slice(0, 25).map(t => (
            <tr key={t.id}>
              <td>{new Date(t.executed_at).toLocaleString()}</td>
              <td>{t.ticker}</td>
              <td>{t.transaction_type}</td>
              <td>{t.quantity}</td>
              <td>${t.price_per_share}</td>
              <td style={{display:'flex', gap:8}}>
                <button onClick={() => setEditTx({...t, executed_at: new Date(t.executed_at).toISOString().slice(0,16)})}>Edit</button>
                <button onClick={() => deleteTx(t.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>

      <div className="card">
        <h2>Activity</h2>
        <ul>
          {activity.map(a => <li key={a.id}>{new Date(a.created_at).toLocaleString()} — {a.action} — {a.detail}</li>)}
        </ul>
      </div>

      {editTx && (
        <div className="modal-backdrop">
          <div className="modal card">
            <h3>Edit Transaction #{editTx.id}</h3>
            <form className="grid grid-2" onSubmit={saveEdit}>
              <input value={editTx.ticker} onChange={e => setEditTx({...editTx, ticker: e.target.value.toUpperCase()})} required />
              <select value={editTx.transaction_type} onChange={e => setEditTx({...editTx, transaction_type: e.target.value})}><option>BUY</option><option>SELL</option></select>
              <input type="number" step="0.000001" value={editTx.quantity} onChange={e => setEditTx({...editTx, quantity: e.target.value})} required />
              <input type="number" step="0.0001" value={editTx.price_per_share} onChange={e => setEditTx({...editTx, price_per_share: e.target.value})} required />
              <input type="number" step="0.01" value={editTx.fees} onChange={e => setEditTx({...editTx, fees: e.target.value})} />
              <input type="datetime-local" value={editTx.executed_at} onChange={e => setEditTx({...editTx, executed_at: e.target.value})} required />
              <input style={{gridColumn:'1 / span 2'}} value={editTx.notes || ''} onChange={e => setEditTx({...editTx, notes: e.target.value})} />
              <div style={{display:'flex', gap:8, gridColumn:'1 / span 2'}}>
                <button type="submit">Save</button>
                <button type="button" onClick={() => setEditTx(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
