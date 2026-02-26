import argparse
from src.config import load_config
from src.portfolio_tracker import Portfolio
from src.trade_journal import append_trade


def main():
    parser = argparse.ArgumentParser(description="Log manual trade execution / skip")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--action", required=True, choices=["BUY", "SELL"]) 
    parser.add_argument("--price", type=float)
    parser.add_argument("--qty", type=int)
    parser.add_argument("--status", required=True, choices=["executed", "skipped"])
    parser.add_argument("--note", default="")
    args = parser.parse_args()

    cfg = load_config("config.yaml")
    pf = Portfolio(starting_capital=cfg.get("starting_capital", 10000))

    if args.status == "executed":
        if args.price is None or args.qty is None:
            raise ValueError("--price and --qty required when status=executed")
        if args.action == "BUY":
            pf.buy(args.symbol, args.price, args.qty)
        elif args.action == "SELL":
            pf.sell(args.symbol, args.price)

    append_trade(
        symbol=args.symbol,
        action=args.action,
        price=args.price,
        qty=args.qty,
        status=args.status,
        note=args.note,
    )
    print("logged")


if __name__ == "__main__":
    main()
