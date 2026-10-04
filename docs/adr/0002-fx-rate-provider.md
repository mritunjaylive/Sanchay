# 2. Foreign Exchange (FX) Rate Provider Choice

Date: 2026-01-01

## Status
Accepted

## Context
Spec sections 2.9 (F-060 to F-062), 8.5, and 11.2 require daily foreign exchange rates against USD for multi-currency conversion, cached on device, with 10-year historical backfill and daily cron updates via an Edge Function (`fx-refresh`). The solution must:
1. Incur zero recurring subscription costs (fitting the free-tier principle).
2. Require no third-party tracking or mandatory paid API keys.
3. Provide reliable daily published rates (such as central bank feeds) with JSON responses.
4. Support all standard ISO 4217 currencies (INR, USD, EUR, GBP, JPY, AED, SGD, KWD, etc.).

## Decision
We select **open.er-api.com** (ExchangeRate-API open tier) as primary, with **Frankfurter / European Central Bank (api.frankfurter.app)** as secondary fallback:
- Primary: `https://open.er-api.com/v6/latest/USD` — returns rates for 160+ fiat currencies against USD base, updated daily, free with no API key needed, high reliability.
- Fallback: `https://api.frankfurter.app/latest?from=USD` (ECB official reference rates).

All provider communication is abstracted behind a clean adapter interface (`FxProvider`) in the `fx-refresh` Edge Function. The edge function stores rates normalized as:
`{ date: YYYY-MM-DD, quote: CURRENCY_CODE, rate_per_usd: NUMERIC }`
in the `fx_rates` Postgres table.

The client pulls and caches these rates in Dexie `db.fxRates`. If offline or if today's rate has not yet landed, the client falls back to the most recent known rate in local storage.

## Consequences
- No paid services or secrets needed for basic FX feeds.
- High resilience: if primary is down, fallback adapter can be used without altering database schemas or client contracts.
- Supports offline usage transparently.
