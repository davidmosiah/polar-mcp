# Dense collection limits

`polar_list_continuous_samples` and `polar_list_ppi_samples` use the
`polar-bounded-collection/v1` contract. Their `max_points` input defaults to 2000
and has a hard maximum of 5000. This is a conservative **JSON-value budget**:
containers and scalar values in all returned upstream records count, not only
fields with familiar sample names. A complete record must fit the remaining
budget. Oversized records are omitted; later smaller records can still fit.
This preserves timestamp/value alignment and never silently slices one channel.

The response reports `max_points`, `budget_used`, `omitted_records`, and
`truncated`. The budget is enforced before privacy normalization, including raw
mode; privacy consent and redaction still apply. Markdown also reports omissions.
A response can contain zero records despite upstream data being available.
`next_page`/`has_more` describe upstream pagination, **not** recovery of omitted
records; use a narrower date range or `polar_heart_series` for bounded HR
aggregation. This is not downsampling, and it is not the
`agent-safe-series/v1` time-series envelope.

The existing `limit` and `max_pages` still bound collection records/pages. Neither
this change nor `max_points` caps upstream response bytes, JSON parse memory,
individual string size, or concurrent requests. Those remain separate resource
controls. Tests use synthetic records and stub the provider; no health account
is required.
