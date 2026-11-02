# Security Policy

Report security issues through GitHub issues if they do not contain secrets. Do not paste OAuth tokens, client secrets, raw health payloads or private activity metadata.

## Sensitive Data

- Polar client secret
- OAuth access and refresh tokens
- Raw Polar AccessLink API payloads
- Sleep, Nightly Recharge, training, route, sample and activity records
- Private profile or device metadata

## Defaults

- Tokens stay local under `~/.polar-mcp/tokens.json`.
- Local config is written with `0600` permissions where supported.
- The server is read-only by default.
- Raw payloads are only returned when explicitly requested.

## Input and dependency hardening

The server supports a single trusted local OS user. HTTP remains loopback-only by default and has no per-client authorization layer; do not expose it to untrusted networks.

- Both stdio and HTTP tool calls accept at most 10,000 combined object members and array elements in arguments. Larger inputs fail before tool input-schema validation or tool execution. This is not a global process-memory limit.
- HTTP JSON bodies remain limited to 1 MiB. Compressed request bodies are explicitly unsupported and return HTTP 415; send uncompressed JSON.
- Dependency security updates do not enable caching or change provider authentication. Run `npm run test:input-limits` after a build to verify ordinary requests, the element boundary, oversized arguments, malformed JSON, body size and compressed-body rejection using synthetic data only.

SDK option reference: https://github.com/modelcontextprotocol/typescript-sdk/blob/3b73021a0a2272c0c04c3917bcdb03398b3ec63f/src/server/mcp.ts#L100-L109 . `maxToolInputElements` is opt-in upstream; this server explicitly sets it to 10,000.
