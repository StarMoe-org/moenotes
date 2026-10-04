import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOperationGate, canIssueKey, toggleSelection } from '../src/lib/account/ui-state.mjs';

test('synchronous gate rejects duplicate calls and releases after failure', async () => {
  const gate = createOperationGate();
  assert.equal(gate.enter(), true);
  assert.equal(gate.enter(), false);
  try { throw new Error('request failed'); } catch { /* simulated request */ } finally { gate.leave(); }
  assert.equal(gate.enter(), true);
});
test('key limit ignores revoked keys but blocks unknown and disabled applications', () => {
  const app = { enabled: true, keys: [{ revokedAt: null }] };
  assert.equal(canIssueKey(app), true);
  assert.equal(canIssueKey({ ...app, keys: [...app.keys, { revokedAt: null }] }), false);
  assert.equal(canIssueKey({ ...app, keys: [...app.keys, { revokedAt: 1 }] }), true);
  assert.equal(canIssueKey({ ...app, keyError: true }), false);
  assert.equal(canIssueKey({ ...app, enabled: false }), false);
});
test('selection is explicit, immutable and deduplicated', () => {
  const initial = [];
  assert.deepEqual(toggleSelection(initial, 'intl/123', false), []);
  const selected = toggleSelection(initial, 'intl/123', true);
  assert.deepEqual(initial, []);
  assert.deepEqual(toggleSelection(selected, 'intl/123', true), ['intl/123']);
  assert.deepEqual(toggleSelection(selected, 'intl/123', false), []);
});

const source = (name) => readFileSync(new URL(`../src/components/account/${name}`, import.meta.url), 'utf8');

test('creation uses every dynamically returned permission and region with no selection UI', async () => {
  const ui = source('OpenPlatform.tsx');
  assert.doesNotMatch(ui, /selectedScopes|selectedRegions|toggleSelection|type="checkbox"|<fieldset/);
  assert.doesNotMatch(ui, /scopes\?\.join/);
  const createBody = ui.match(/async function create\(\) \{([\s\S]*?)\n  \}\n\n  async function issue/)[1]
    .replace(/api<\{ application: App \}>/g, 'api');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const create = new AsyncFunction('name', 'loading', 'options', 'api', 'accountApi', 'setSecret', 'setName', 'setApps', 'setSelectedId', 'issue', 'load', 'setFailed', 'setMessage', 't', 'locale', createBody);
  const noop = () => {};
  for (const options of [
    { scopes: ['new:scope', 'another:scope'], regions: ['new-region', 'other-region'] },
    { scopes: ['future:scope'], regions: ['future-region'] },
  ]) {
    let sent;
    await create('  Example  ', false, options, async (path, method, body) => {
      sent = { path, method, body }; return { application: { id: 'created' } };
    }, { developerApps: '/apps' }, noop, noop, noop, noop, noop, noop, noop, noop, noop, 'en-US');
    assert.deepEqual(sent, { path: '/apps', method: 'POST', body: { name: 'Example', ...options } });
  }
  let failed = false;
  let message;
  await create('Example', false, { scopes: ['dynamic:scope'], regions: ['dynamic-region'] }, async () => ({ application: { id: 'created' } }), { developerApps: '/apps' }, noop, noop, noop, noop, async () => { throw new Error('key issuance failed'); }, noop, (value) => { failed = value; }, (value) => { message = value; }, (_, key) => key, 'en-US');
  assert.equal(failed, true);
  assert.equal(message, 'openPlatform.createdKeyFailed');
});

test('account UI reuses real system sections, action cards and native archive consent', () => {
  const styles = source('ui-styles.ts');
  assert.match(styles, /accountSection = "mn-system-section/);
  assert.doesNotMatch(styles, /rounded-full/);
  for (const name of ['OpenPlatformPanel.tsx', 'AccountPanel.tsx']) {
    assert.match(source(name), /accountSection as panel/);
  }
  const platform = source('OpenPlatform.tsx');
  const grants = source('SaveAuthorizations.tsx');
  assert.match(platform, /mn-list-card mn-card/);
  assert.match(grants, /mn-list-card mn-card/);
  assert.match(grants, /type="checkbox" disabled=\{busy\} checked=\{checked\}/);
  assert.match(grants, /disabled=\{busy \|\| !selected.length\}/);
  assert.match(grants, /setSelected\(\[\]\)/);
  assert.doesNotMatch(platform.match(/<form[\s\S]*?<\/form>/)[0], /mn-list-card|mn-card|mn-sticker/);
  const page = source('OpenPlatformPage.astro');
  assert.match(page, /mn-system-section/);
  assert.match(page, /mn-list-card mn-sticker/);
  assert.equal((page.match(/<a\s/g) || []).length, 1);
  assert.match(page, /href=\{openPlatformDocsUrl\}/);
  const site = readFileSync(new URL('../src/config/site.ts', import.meta.url), 'utf8');
  assert.match(site, /openPlatformDocsUrl = "https:\/\/open-platform.bdon.moe\/"/);
});
