from pathlib import Path
import pandas as pd
import streamlit as st
import plotly.express as px

st.set_page_config(page_title="Trading System Dashboard", layout="wide")
st.title("US Equities Swing Dashboard")

journal_path = Path("state/trade_journal.csv")
portfolio_path = Path("state/portfolio.json")

if not journal_path.exists():
    st.warning("No trades logged yet. Use src.log_trade to record executed/skipped trades.")
    st.stop()

tr = pd.read_csv(journal_path)
tr["ts"] = pd.to_datetime(tr["ts"], errors="coerce")
tr = tr.sort_values("ts")

col1, col2, col3, col4 = st.columns(4)
executed = tr[tr["status"] == "executed"]
skipped = tr[tr["status"] == "skipped"]

col1.metric("Total Signals Logged", len(tr))
col2.metric("Executed", len(executed))
col3.metric("Skipped", len(skipped))
col4.metric("Execution Rate", f"{(len(executed)/len(tr)*100):.1f}%" if len(tr) else "0%")

# Build closed-trade PnL from BUY->SELL pairs per symbol
closed_rows = []
for symbol, g in executed.groupby("symbol"):
    g = g.sort_values("ts")
    buys = g[g["action"] == "BUY"].reset_index(drop=True)
    sells = g[g["action"] == "SELL"].reset_index(drop=True)
    n = min(len(buys), len(sells))
    for i in range(n):
        bp = float(buys.loc[i, "price"])
        sp = float(sells.loc[i, "price"])
        qty = int(sells.loc[i, "qty"] if pd.notna(sells.loc[i, "qty"]) else buys.loc[i, "qty"])
        pnl = (sp - bp) * qty
        ret = (sp / bp - 1) * 100
        closed_rows.append({
            "symbol": symbol,
            "buy_time": buys.loc[i, "ts"],
            "sell_time": sells.loc[i, "ts"],
            "qty": qty,
            "buy_price": bp,
            "sell_price": sp,
            "pnl": pnl,
            "return_pct": ret,
        })

closed = pd.DataFrame(closed_rows)

st.subheader("Trade Outcomes")
if closed.empty:
    st.info("No closed trades yet (need SELL logs to compute win/loss).")
else:
    wins = (closed["pnl"] > 0).sum()
    losses = (closed["pnl"] <= 0).sum()
    win_rate = wins / len(closed) * 100

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Closed Trades", len(closed))
    c2.metric("Win Rate", f"{win_rate:.1f}%")
    c3.metric("Total PnL", f"${closed['pnl'].sum():,.2f}")
    c4.metric("Avg Return/Trade", f"{closed['return_pct'].mean():.2f}%")

    curve = closed.sort_values("sell_time").copy()
    curve["equity_pnl"] = curve["pnl"].cumsum()
    fig_curve = px.line(curve, x="sell_time", y="equity_pnl", title="Cumulative PnL (Closed Trades)")
    st.plotly_chart(fig_curve, use_container_width=True)

    fig_sym = px.bar(closed.groupby("symbol", as_index=False)["pnl"].sum(), x="symbol", y="pnl", title="PnL by Symbol")
    st.plotly_chart(fig_sym, use_container_width=True)

    st.dataframe(closed.sort_values("sell_time", ascending=False), use_container_width=True)

st.subheader("Signal Log")
st.dataframe(tr.sort_values("ts", ascending=False), use_container_width=True)

if portfolio_path.exists():
    st.subheader("Current Portfolio State")
    st.json(portfolio_path.read_text(encoding="utf-8"))
