'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Page() {
  const [portfolios, setPortfolios] = useState([]);
  const [portfolioId, setPortfolioId] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [positions, setPositions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [newPortfolio, setNewPortfolio] = useState('');
  const [form, setForm] = useState({ ticker: '', transaction_type: 'BUY', quantity: '', price_per_share: '', fees: '0', executed_at: new Date().toISOString().slice(0,16), notes: '' });

  async function loadPortfolios() {
    const r = await fetch(`${API}/api/v1/portfolios`).then(x => x.json());
    setPortfolios(r.data || []);
    if (!portfolioId && r.data?.length) setPortfolioId(String(r.data[0].id));
  }

  async function loadData(pid = portfolioId) {
    if (!pid) return;
    const q = `?portfolio_id=${pid}`;
    const [d, p, t] = await Promise.all([
      fetch(`${API}/api/v1/dashboard${q}`).then(r => r.json()),
      fetch(`${API}/api/v1/positions${q}`).then(r => r.json()),
      fetch(`${API}/api/v1/transactions${q}`).then(r => r.json()),
    ]);
    setDashboard(d.data);
    setPositions(p.data || []);
    setTransactions(t.data || []);
  }

  useEffect(() => { loadPortfolios(); }, []);
  useEffect(() => { if (portfolioId) loadData(portfolioId); }, [portfolioId]);

  async function createPortfolio() {
    if (!newPortfolio.trim()) return;
    await fetch(`${API}/api/v1/portfolios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPortfolio.trim(), initial_cash: 0 })
    });
    setNewPortfolio('');
    await loadPortfolios();
  }

  async function submit(e) {
    e.preventDefault();
    await fetch(`${API}/api/v1/transactions?portfolio_id=${portfolioId}`, {
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
    await loadData();
  }

  async function deleteTx(id) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    await fetch(`${API}/api/v1/transactions/${id}`, { method: 'DELETE' });
    await loadData();
  }

  async function editTx(tx) {
    const ticker = prompt('Ticker', String(tx.ticker || ''));
    if (!ticker) return;
    const transaction_type = prompt('Type (BUY/SELL)', String(tx.transaction_type || 'BUY'));
    if (!transaction_type) return;
    const quantity = prompt('Quantity', String(tx.quantity));
    if (!quantity) return;
    const price = prompt('Price per share', String(tx.price_per_share));
    if (!price) return;
    const fees = prompt('Fees', String(tx.fees || 0));
    if (fees === null) return;
    const dtDefault = new Date(tx.executed_at).toISOString().slice(0, 16);
    const executed_at = prompt('Executed at (YYYY-MM-DDTHH:mm)', dtDefault);
    if (!executed_at) return;
    const notes = prompt('Notes', String(tx.notes || ''));
    if (notes === null) return;

    await fetch(`${API}/api/v1/transactions/${tx.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: ticker.toUpperCase(),
        transaction_type: transaction_type.toUpperCase(),
        quantity: Number(quantity),
        price_per_share: Number(price),
        fees: Number(fees || 0),
        executed_at: new Date(executed_at).toISOString(),
        notes: notes || ''
      })
    });
    await loadData();
  }

  return (
    <div className="container grid" style={{gap: 24}}>
      <h1>Portfolio Tracker MVP</h1>

      <div className="card grid grid-2">
        <div>
          <div style={{marginBottom: 8}}>Portfolio</div>
          <select value={portfolioId} onChange={e => setPortfolioId(e.target.value)}>
            {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{marginBottom: 8}}>Create Portfolio Group</div>
          <div style={{display:'flex', gap: 8}}>
            <input placeholder="401K / Personal / ESPP" value={newPortfolio} onChange={e => setNewPortfolio(e.target.value)} />
            <button onClick={createPortfolio}>Add</button>
          </div>
        </div>
      </div>

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
        <table><thead><tr><th>Date</th><th>Ticker</th><th>Type</th><th>Qty</th><th>Price</th><th>Actions</th></tr></thead><tbody>
          {transactions.slice(0, 25).map(t => (
            <tr key={t.id}>
              <td>{new Date(t.executed_at).toLocaleString()}</td>
              <td>{t.ticker}</td>
              <td>{t.transaction_type}</td>
              <td>{t.quantity}</td>
              <td>${t.price_per_share}</td>
              <td style={{display:'flex', gap:8}}>
                <button onClick={() => editTx(t)}>Edit</button>
                <button onClick={() => deleteTx(t.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
