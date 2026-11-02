import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseLocalRedirectUri } from '../dist/cli/auth.js';
import { buildConnectionStatus } from '../dist/services/connection-status.js';

const defaultScopes = 'activity:read calendar:read continuous_samples:read devices:read nightly_recharge:read ppi_data:read profile:read routes:read skin_contact:read sleep:read sports:read temperature_measurement:read tests:read training_sessions:read training_targets:read user_subscription:read';
const dir = mkdtempSync(join(tmpdir(), 'polar-mcp-cli-'));

try {
  const missing = await buildConnectionStatus({ env: {}, homeDir: dir, nowMs: 1_000_000 });
  assert.equal(missing.ok, false);
  assert.equal(missing.ready_for_polar_api, false);
  assert.deepEqual(missing.missing_env, ['POLAR_CLIENT_ID', 'POLAR_CLIENT_SECRET', 'POLAR_REDIRECT_URI']);
  assert.ok(missing.next_steps.some((step) => step.includes('POLAR_CLIENT_ID')));

  const tokenPath = join(dir, 'tokens.json');
  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000,
    scope: defaultScopes
  }), { mode: 0o600 });

  const ready = await buildConnectionStatus({
    env: {
      POLAR_CLIENT_ID: 'client-id',
      POLAR_CLIENT_SECRET: 'client-secret',
      POLAR_REDIRECT_URI: 'http://127.0.0.1:4567/callback',
      POLAR_TOKEN_PATH: tokenPath,
      POLAR_PRIVACY_MODE: 'summary',
      POLAR_CACHE: 'sqlite'
    },
    homeDir: dir,
    nowMs: 1_000_000
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.ready_for_polar_api, true);
  assert.equal(ready.privacy_mode, 'summary');
  assert.equal(ready.cache.enabled, false, 'POLAR_CACHE must not report an active cache: authenticated responses are never cached');
  assert.equal(ready.token.exists, true);
  assert.equal(ready.token.secure_permissions, true);
  assert.equal(ready.token.has_refresh_token, true);
  assert.equal(ready.oauth.scope_status, 'ok');

  assert.deepEqual(parseLocalRedirectUri('http://127.0.0.1:4567/callback'), {
    host: '127.0.0.1',
    port: 4567,
    path: '/callback'
  });
  assert.throws(() => parseLocalRedirectUri('https://example.com/callback'), /local redirect URI/i);

  const doctor = spawnSync(process.execPath, ['dist/index.js', 'doctor', '--json'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(doctor.status, 0, doctor.stderr);
  const doctorPayload = JSON.parse(doctor.stdout);
  assert.equal(doctorPayload.ok, false);
  assert.ok(doctorPayload.next_steps.some((step) => step.includes('POLAR_CLIENT_ID')));

  const typo = spawnSync(process.execPath, ['dist/index.js', 'docter'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /Unknown command: docter/);

  const authWithoutEnv = spawnSync(process.execPath, ['dist/index.js', 'auth', '--no-open'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(authWithoutEnv.status, 1);
  assert.match(authWithoutEnv.stderr, /Missing required POLAR environment variables/);
  assert.doesNotMatch(authWithoutEnv.stderr, new RegExp('at .*dist/'));

  const setup = spawnSync(process.execPath, [
    'dist/index.js',
    'setup',
    '--client',
    'generic',
    '--client-id',
    'client-id-from-setup',
    '--client-secret',
    'client-secret-from-setup',
    '--redirect-uri',
    'http://127.0.0.1:4567/callback',
    '--privacy-mode',
    'summary',
    '--cache',
    'sqlite',
    '--no-auth',
    '--json'
  ], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(setup.status, 0, setup.stderr);
  const setupPayload = JSON.parse(setup.stdout);
  assert.equal(setupPayload.ok, true);
  assert.match(setupPayload.config_path, /config\.json$/);
  assert.match(setupPayload.client_config_path, /generic\.json$/);

  const configPath = join(dir, '.polar-mcp', 'config.json');
  const configMode = (statSync(configPath).mode & 0o777).toString(8);
  assert.equal(configMode, '600');
  const savedConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(savedConfig.POLAR_CLIENT_ID, 'client-id-from-setup');
  assert.equal(savedConfig.POLAR_CLIENT_SECRET, 'client-secret-from-setup');
  assert.equal(savedConfig.POLAR_SCOPES, defaultScopes);
  assert.equal(savedConfig.POLAR_PRIVACY_MODE, 'summary');
  assert.equal(savedConfig.POLAR_CACHE, 'sqlite');

  const doctorAfterSetup = spawnSync(process.execPath, ['dist/index.js', 'doctor', '--json'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir
    }
  });
  assert.equal(doctorAfterSetup.status, 0, doctorAfterSetup.stderr);
  const doctorAfterSetupPayload = JSON.parse(doctorAfterSetup.stdout);
  assert.deepEqual(doctorAfterSetupPayload.missing_env, []);
  assert.equal(doctorAfterSetupPayload.config.source, 'local_config');
  assert.equal(doctorAfterSetupPayload.automatic_auth_supported, true);
  assert.ok(doctorAfterSetupPayload.next_steps.some((step) => step.includes('auth')));

  console.log(JSON.stringify({ ok: true, cli_ux: true, doctor: true, status: true, auth_plan: true, setup: true }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
