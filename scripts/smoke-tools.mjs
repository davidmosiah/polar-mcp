import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expectedTools = [
  'polar_agent_manifest', 'polar_cache_status', 'polar_capabilities', 'polar_connection_status',
  'polar_daily_summary', 'polar_data_inventory', 'polar_exchange_code', 'polar_get_account_data',
  'polar_get_auth_url', 'polar_get_route', 'polar_list_activity', 'polar_list_calendar',
  'polar_list_continuous_samples', 'polar_list_nightly_recharge', 'polar_list_ppi_samples', 'polar_list_skin_contacts',
  'polar_list_sleep_wake_vectors', 'polar_list_sleeps', 'polar_list_sport_profile_catalog', 'polar_list_sport_profiles',
  'polar_list_sports', 'polar_list_subscriptions', 'polar_list_temperature_measurements', 'polar_list_tests',
  'polar_list_training_sessions', 'polar_list_training_target_favorites', 'polar_list_training_targets', 'polar_list_user_devices',
  'polar_privacy_audit', 'polar_revoke_access', 'polar_weekly_summary', 'polar_wellness_context'
];

const expectedResources = [
  'polar://account-data', 'polar://agent-manifest', 'polar://capabilities', 'polar://inventory',
  'polar://latest/sleep', 'polar://summary/daily', 'polar://summary/weekly'
];
const expectedPrompts = ['polar_daily_checkin', 'polar_training_load_investigation', 'polar_weekly_review'];

const client = new Client({ name: 'polar-mcp-smoke-test', version: '0.0.0' });
const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
await client.connect(transport);
try {
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, expectedTools.sort());

  const resources = await client.listResources();
  const resourceUris = resources.resources.map((resource) => resource.uri).sort();
  assert.deepEqual(resourceUris, expectedResources.sort());

  const prompts = await client.listPrompts();
  const promptNames = prompts.prompts.map((prompt) => prompt.name).sort();
  assert.deepEqual(promptNames, expectedPrompts.sort());

  const prompt = await client.getPrompt({ name: 'polar_daily_checkin', arguments: { focus: 'sleep' } });
  assert.ok(prompt.messages[0]?.content?.type === 'text');

  const auditResult = await client.callTool({ name: 'polar_privacy_audit', arguments: { response_format: 'json' } });
  assert.equal(auditResult.structuredContent?.unofficial, true);
  assert.ok(auditResult.structuredContent?.secret_env_vars?.includes('POLAR_CLIENT_SECRET'));

  const capabilitiesResult = await client.callTool({ name: 'polar_capabilities', arguments: { response_format: 'json' } });
  assert.equal(capabilitiesResult.structuredContent?.unofficial, true);
  assert.ok(capabilitiesResult.structuredContent?.api_boundary?.does_not_include?.includes('write/upload/delete actions'));
  assert.ok(capabilitiesResult.structuredContent?.supported_data?.some((entry) => entry.tools?.includes('polar_list_nightly_recharge')));
  assert.ok(capabilitiesResult.structuredContent?.recommended_agent_flow?.some((step) => step.includes('polar_connection_status')));

  const inventoryResult = await client.callTool({ name: 'polar_data_inventory', arguments: { response_format: 'json' } });
  assert.equal(inventoryResult.structuredContent?.kind, 'data_inventory');
  assert.equal(typeof inventoryResult.structuredContent?.source, 'string');

  const manifestResult = await client.callTool({ name: 'polar_agent_manifest', arguments: { client: 'hermes', response_format: 'json' } });
  assert.equal(manifestResult.structuredContent?.client, 'hermes');
  assert.ok(manifestResult.structuredContent?.hermes?.common_tool_names?.includes('mcp_polar_polar_connection_status'));
  assert.ok(manifestResult.structuredContent?.standard_tools?.includes('polar_list_training_sessions'));
  assert.equal(manifestResult.structuredContent?.hermes?.no_gateway_restart_for_data_access, true);

  const statusResult = await client.callTool({ name: 'polar_connection_status', arguments: { client: 'hermes', response_format: 'json' } });
  assert.equal(statusResult.structuredContent?.ok, false);
  assert.ok(statusResult.structuredContent?.missing_env?.includes('POLAR_CLIENT_ID'));
  assert.equal(statusResult.structuredContent?.client, 'hermes');

  console.log(JSON.stringify({ ok: true, tools: toolNames.length, resources: resourceUris.length, prompts: promptNames.length }, null, 2));
} finally {
  await client.close();
}
