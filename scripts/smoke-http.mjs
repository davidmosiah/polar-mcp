import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const home = mkdtempSync(join(tmpdir(), 'polar-http-smoke-'));
const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, validateSchema: true });
const client = new Client({ name: 'polar-http-smoke', version: '0.0.0' }, {
  jsonSchemaValidator: new AjvJsonSchemaValidator(ajv)
});
const port = String(43000 + Math.floor(Math.random() * 1000));
const healthCheckAttempts = 100;
const healthCheckDelayMs = 200;
const child = spawn(process.execPath, ['dist/index.js', '--http'], {
  env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, POLAR_MCP_PORT: port, POLAR_MCP_HOST: '127.0.0.1' },
  stdio: ['ignore', 'ignore', 'pipe']
});

let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode, data: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('HTTP health check timed out')));
    request.on('error', reject);
  });
}

try {
  let ok = false;
  for (let i = 0; i < healthCheckAttempts; i += 1) {
    try {
      const { statusCode, data } = await getJson(`http://127.0.0.1:${port}/health`);
      assert.equal(statusCode, 200);
      assert.equal(data.ok, true);
      ok = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, healthCheckDelayMs));
    }
  }
  if (!ok) throw new Error(`HTTP server did not become healthy. stderr=${stderr}`);
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  const { tools } = await client.listTools();
  assert.ok(tools.length > 0, 'HTTP must advertise tools');
  for (const tool of tools) {
    for (const key of ['inputSchema', 'outputSchema']) {
      if (tool[key]) assert.doesNotThrow(() => ajv.compile(tool[key]), `${tool.name}.${key}`);
    }
  }
  console.log(JSON.stringify({ ok: true, transport: 'http', tools: tools.length }, null, 2));
} finally {
  await client.close();
  child.kill('SIGTERM');
  rmSync(home, { recursive: true, force: true });
}
