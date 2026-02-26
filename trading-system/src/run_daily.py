from src.config import load_config
from src.sector_strength import rank_sectors
from src.strategy import generate_signal
from src.notifier_telegram import send_telegram


def main():
    cfg = load_config("config.yaml")
    sectors = cfg["universe"]["sector_etfs"]
    symbols = cfg["universe"]["tradable_symbols"]

    ranked = rank_sectors(sectors)
    top = set(ranked.head(3)["symbol"].tolist())

    lines = ["Daily Sector Rank:"]
    for _, row in ranked.head(5).iterrows():
        lines.append(f"{row['symbol']}: score={row['score']:.2%}")

    lines.append("\nSignals:")
    for s in symbols:
        # simple placeholder mapping: sector strength as market risk-on proxy
        sig = generate_signal(s, sector_is_strong=len(top) > 0)
        lines.append(f"{s}: {sig}")

    msg = "\n".join(lines)
    send_telegram(cfg["telegram"]["bot_token"], cfg["telegram"]["chat_id"], msg)
    print(msg)


if __name__ == "__main__":
    main()
