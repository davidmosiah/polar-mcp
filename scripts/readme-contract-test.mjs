/**
 * Contract gate for the README's public surface list.
 *
 * Scope note, recorded deliberately: this repo's README (and docs/quickstart.md)
 * contains exactly one ```json block, and it is an MCP *client config* snippet —
 * `mcpServers.polar.command/args`. It is not tool output, so it carries no
 * payload contract and is not gated here. `scripts/demo-contract-test.mjs` is
 * what guards the payload shapes, by running the real builders.
 *
 * What the README *does* publish as fact is the list of tools, prompts and
 * resources the server exposes. That is the first thing a human reads, and
 * nothing compared it with the server: at 0.4.0 the README documented 31 tools
 * while the server registered 37 — `polar_demo`, `polar_quickstart`,
 * `polar_onboarding`, `polar_wellness_context`, `polar_profile_get` and
 * `polar_profile_update` were shipped and never mentioned, along with three
 * resources. Same defect class as the demo drift, one layer up and with a
 * bigger audience.
 *
 * This gate parses the lists out of README.md at run time — it does NOT keep a
 * copy of them — and compares against a REAL server process over stdio, failing
 * in both directions:
 *
 *   - a name in the README the server does not register -> phantom promise
 *   - a name the server registers the README omits      -> undocumented surface
 *
 * Copying the expected names into this file would recreate the very drift it
 * exists to catch, one layer higher. Both sides must stay derived.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const README = readFileSync(path.join(ROOT, 'README.md'), 'utf8');

/**
 * Slice a `## Heading` section out of the README, up to the next `##` heading.
 * The section must exist — deleting it is not a way to pass this gate.
 */
function section(heading) {
  const pattern = new RegExp(`^## ${heading}\\s*$([\\s\\S]*?)(?=^## )`, 'm');
  const match = README.match(pattern);
  assert.ok(
    match,
    `README.md: missing the "## ${heading}" section. The published list has to stay ` +
      `in the README so this gate can compare it with the running server.`
  );
  return match[1];
}

/** Backticked tokens in a section that match `shape`, deduped and sorted. */
function documented(heading, shape) {
  const text = section(heading);
  const hits = [...text.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1])
    .filter((token) => shape.test(token));
  return [...new Set(hits)].sort();
}

const client = new Client({ name: 'polar-mcp-readme-contract', version: '0.0.0' });
const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
await client.connect(transport);

let live;
try {
  live = {
    tools: (await client.listTools()).tools.map((t) => t.name).sort(),
    prompts: (await client.listPrompts()).prompts.map((p) => p.name).sort(),
    resources: (await client.listResources()).resources.map((r) => r.uri).sort()
  };
} finally {
  await client.close();
}

const TOOL_SHAPE = /^polar_[a-z0-9_]+$/;
const RESOURCE_SHAPE = /^polar:\/\/[a-z0-9/_-]+$/;

const promptNames = new Set(live.prompts);

const checks = [
  {
    label: 'tools',
    // The Tools section lists tools only; prompt names appear under ## Prompts.
    documented: documented('Tools', TOOL_SHAPE).filter((n) => !promptNames.has(n)),
    live: live.tools
  },
  { label: 'prompts', documented: documented('Prompts', TOOL_SHAPE), live: live.prompts },
  { label: 'resources', documented: documented('Resources', RESOURCE_SHAPE), live: live.resources }
];

const failures = [];
let verified = 0;

for (const { label, documented: docList, live: liveList } of checks) {
  const liveSet = new Set(liveList);
  const docSet = new Set(docList);

  const phantom = docList.filter((n) => !liveSet.has(n));
  const undocumented = liveList.filter((n) => !docSet.has(n));

  if (phantom.length > 0) {
    failures.push(
      `\n  README ${label}: ${phantom.length} name(s) published that the server does NOT register.` +
        `\n  A reader who tries these gets "unknown tool":\n` +
        phantom.map((n) => `    - ${n}`).join('\n')
    );
  }
  if (undocumented.length > 0) {
    failures.push(
      `\n  README ${label}: ${undocumented.length} name(s) the server registers but the README omits.` +
        `\n  Shipped surface nobody reading the repo can discover:\n` +
        undocumented.map((n) => `    + ${n}`).join('\n')
    );
  }
  if (phantom.length === 0 && undocumented.length === 0) {
    verified += docList.length;
    console.log(`PASS README ${label} — ${docList.length} name(s) match the running server`);
  }
}

// A section that parsed to nothing would pass the set comparison only if the
// server also exposed nothing. Assert non-empty so an emptied list is loud.
for (const { label, documented: docList } of checks) {
  assert.ok(docList.length > 0, `README ${label} list parsed as empty — the gate cannot verify an absent list`);
}

if (failures.length > 0) {
  console.error('\nFAIL README drifted from the running server:');
  console.error(failures.join('\n'));
  console.error(
    '\nFix README.md so the published lists match what dist/index.js registers.' +
      '\nDo not narrow the parser to silence this — that is how the drift got here.\n'
  );
  process.exit(1);
}

console.log(`\nreadme-contract: ${verified} published name(s) verified against a live server process`);
console.log(JSON.stringify({ ok: true, suite: 'readme-contract', sections: checks.length }));
