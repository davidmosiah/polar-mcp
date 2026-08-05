# FAQ

## Is this official?

No. It is unofficial and not affiliated with Polar.

## What data can it read?

User-authorized Polar AccessLink Dynamic API v4 data: account metadata, devices, activity, calendar, sleep, sleep/wake vectors, Nightly Recharge, training sessions, training targets, routes, sports, subscriptions, temperature, tests, PPI samples, continuous samples and skin contacts.

## Does it provide raw sensor data?

Only when `privacy_mode=raw` is explicitly requested. `summary` and `structured` modes minimize identifiers and redact GPS by default.

## Is it medical advice?

No. It provides wellness/training context only.

## Dense continuous samples

Prefer **`polar_heart_series`** (agent-safe-series/v1) over dumping full continuous-sample lists into agent context.
