'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Page() {
  const [dashboard, setDashboard] = useState(null);
  const [positions, setPositions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({ ticker: '', transaction_type: 'BUY', quantity: '', price_per_share: '', fees: '0', executed_at: new Date().toISOString().slice(0,16), notes: '' });

  async function load() {
    const [d, p, t] = await Promise.all([
      fetch(`${API}/api/v1/dashboard`).then(r => r.json()),
      fetch(`${API}/api/v1/positions`).then(r => r.json()),
      fetch(`${API}/api/v1/transactions`).then(r => r.json()),
    ]);
    setDashboard(d.data);
    setPositions(p.data || []);
    setTransactions(t.data || []);
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    await fetch(`${API}/api/v1/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        quantity: Number(form.quantity),
        price_per_share: Number(form.price_per_share),
        fees: Number(form.fees || 0),
        executed_at: new Date(form.executed_at).toISOString(),
      })
    });
    setForm({ ...form, ticker: '', quantity: '', price_per_share: '', notes: '' });
    await load();
  }

  return (
    <div className="container grid" style={{gap: 24}}>
      <h1>Portfolio Tracker MVP</h1>

      {dashboard && (
        <div className="grid grid-3">
          <div className="card"><div>Total Value</div><h2>${dashboard.total_value.toFixed(2)}</h2></div>
          <div className="card"><div>Total P&L</div><h2 className={dashboard.unrealized_pnl >= 0 ? 'pos' : 'neg'}>${dashboard.unrealized_pnl.toFixed(2)} ({dashboard.unrealized_pnl_pct.toFixed(2)}%)</h2></div>
          <div className="card"><div>Benchmarks (1Y)</div><h3>SPY {dashboard.benchmark_spy_return_pct}% · QQQ {dashboard.benchmark_qqq_return_pct}%</h3></div>
        </div>
      )}

      <div className="card">
        <h2>Add Trade</h2>
        <form className="grid grid-2" onSubmit={submit}>
          <input placeholder="Ticker" value={form.ticker} onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })} required />
          <select value={form.transaction_type} onChange={e => setForm({ ...form, transaction_type: e.target.value })}>
            <option>BUY</option><option>SELL</option>
          </select>
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
        <table><thead><tr><th>Date</th><th>Ticker</th><th>Type</th><th>Qty</th><th>Price</th></tr></thead><tbody>
          {transactions.slice(0, 15).map(t => (
            <tr key={t.id}><td>{new Date(t.executed_at).toLocaleString()}</td><td>{t.ticker}</td><td>{t.transaction_type}</td><td>{t.quantity}</td><td>${t.price_per_share}</td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
