const assert = require('node:assert/strict');
const { test, beforeEach, afterEach, after } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const app = path.resolve(__dirname, '..');
const output = mkdtempSync(path.join(tmpdir(), 'stockroom-stock-tests-'));
execFileSync(process.execPath, [path.join(app, 'node_modules/typescript/bin/tsc'),
  'src/repositories/stock.ts', '--outDir', output, '--strict', '--skipLibCheck', '--target', 'es2022',
  '--module', 'commonjs', '--types', 'node', '--typeRoots', 'node_modules/@types', '--esModuleInterop'
], { cwd: app, stdio: 'inherit' });
const store = new Map();
const storage = {
  getItem: async key => store.get(key) ?? null,
  setItem: async (key, value) => { store.set(key, value); }
};
const originalLoad = Module._load;
let storageAvailable = true;
let storageImports = 0;
Module._load = function(id, ...args) {
  if (id === 'react-native') return { TurboModuleRegistry: { get: () => storageAvailable ? {} : null } };
  if (id === '@react-native-async-storage/async-storage') {
    storageImports += 1;
    if (!storageAvailable) throw new Error('Native module missing');
    return storage;
  }
  return originalLoad.call(this, id, ...args);
};
const repo = require(path.join(output, 'repositories/stock.js'));
const recovery = require(path.join(output, 'api/requestRecovery.js'));
const { REQUEST_TIMEOUT_MS } = require(path.join(output, 'api/client.js'));
const originalFetch = global.fetch;
const originalSet = storage.setItem;
const originalGet = storage.getItem;
const productId = '7da1f001-6292-4224-864e-e0817b6248d3';
const adjustmentId = '0da1f001-6292-4224-864e-e0817b6248d3';
const date = '2026-11-01T12:00:00Z';
let calls;
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const marker = (id = adjustmentId, apiBaseUrl = 'http://previous-server:8081') => ({
  requestId: id, operationType: 'adjustment', apiBaseUrl, submittedAt: date
});
const saved = requestId => ({ id: adjustmentId, productId, requestId, quantity: 2, reason: 'Delivery', createdAt: date });
beforeEach(() => { calls = []; store.clear(); storageAvailable = true; storageImports = 0; });
afterEach(() => { global.fetch = originalFetch; storage.setItem = originalSet; storage.getItem = originalGet; });
after(() => { Module._load = originalLoad; rmSync(output, { recursive: true, force: true }); });

test('waits for minimal marker persistence before one POST and removes confirmed marker', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  storage.setItem = async (key, value) => { entered(); await gate; await originalSet(key, value); };
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body);
    const markers = await recovery.listRecoveryMarkers();
    assert.equal(markers.length, 1);
    assert.deepEqual(Object.keys(markers[0]).sort(), ['apiBaseUrl', 'operationType', 'requestId', 'submittedAt']);
    assert.equal(markers[0].requestId, body.requestId);
    assert.deepEqual(body, { requestId: body.requestId, quantity: 2, reason: 'Delivery' });
    return response(saved(body.requestId), 201);
  };
  const pending = repo.adjustStock(productId, 2, ' Delivery ');
  await started;
  assert.equal(calls.length, 0);
  release();
  assert.equal((await pending).quantity, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(await recovery.listRecoveryMarkers(), []);
});

test('storage failure prevents POST and preserves every outstanding marker', async () => {
  await recovery.saveRecoveryMarker(marker());
  storage.setItem = async () => { throw new Error('disk'); };
  global.fetch = async () => { calls.push(1); throw new Error('must not send'); };
  await assert.rejects(repo.adjustStock(productId, 2, 'Delivery'), error => error.code === 'recoveryStorage');
  assert.equal(calls.length, 0);
  assert.deepEqual(await recovery.listRecoveryMarkers(), [marker()]);
});

test('serialized concurrent marker updates preserve all requests and backends', async () => {
  const first = marker(), second = marker(productId), third = marker(adjustmentId, 'http://other-server');
  await Promise.all([first, second, third].map(recovery.saveRecoveryMarker));
  assert.equal((await recovery.listRecoveryMarkers()).length, 3);
  await Promise.all([recovery.clearRecoveryMarker(first), recovery.saveRecoveryMarker(marker('33333333-3333-4333-8333-333333333333'))]);
  const rows = await recovery.listRecoveryMarkers();
  assert.equal(rows.length, 3);
  assert.ok(rows.some(m => m.apiBaseUrl === 'http://other-server'));
  assert.ok(!rows.some(m => m.apiBaseUrl === first.apiBaseUrl && m.requestId === first.requestId));
});

test('timeout retains the marker and a recorded-backend 404 stays unresolved without replay', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let sent;
  const started = new Promise(resolve => { sent = resolve; });
  global.fetch = (_url, init) => {
    calls.push(init); sent();
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abort'))));
  };
  const pending = repo.adjustStock(productId, 2, 'Delivery');
  const rejection = assert.rejects(pending, error => error.code === 'requestTimeout');
  await started; t.mock.timers.tick(REQUEST_TIMEOUT_MS); await rejection;
  const [outstanding] = await recovery.listRecoveryMarkers();
  assert.ok(outstanding);
  const previous = { ...outstanding, apiBaseUrl: 'http://recorded-server:8081' };
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    assert.match(url, /^http:\/\/recorded-server:8081\/api\/v1\/stock\/adjustments\/by-request-id\//);
    assert.equal(init.method, undefined);
    return response({ error: { code: 'request_not_found' } }, 404);
  };
  await assert.rejects(repo.lookupAdjustment(previous), error => error.code === 'request_not_found');
  assert.deepEqual(await recovery.listRecoveryMarkers(), [outstanding]);
  assert.equal(calls.length, 2);
});

test('malformed and uncertain failures retain markers; definitive rollback removes only its marker', async () => {
  const previous = marker(); await recovery.saveRecoveryMarker(previous);
  for (const [value, status] of [[{}, 201], [{ error: { code: 'internal_error' } }, 500], [{ error: { code: 'upstream_unavailable' } }, 503]]) {
    global.fetch = async () => response(value, status);
    await assert.rejects(repo.adjustStock(productId, 2, 'Delivery'));
  }
  assert.equal((await recovery.listRecoveryMarkers()).length, 4);
  const before = await recovery.listRecoveryMarkers();
  for (const [code, status] of [['numeric_overflow', 422], ['inventory_busy', 503]]) {
    global.fetch = async () => response({ error: { code } }, status);
    await assert.rejects(repo.adjustStock(productId, 2, 'Delivery'), error => error.code === code);
    assert.deepEqual(await recovery.listRecoveryMarkers(), before);
  }
});

test('marker cleanup failure after confirmed write still returns success', async () => {
  let count = 0;
  storage.setItem = async (key, value) => {
    if (++count > 1) throw new Error('disk');
    return originalSet(key, value);
  };
  global.fetch = async (_url, init) => response(saved(JSON.parse(init.body).requestId), 201);
  assert.equal((await repo.adjustStock(productId, 2, 'Delivery')).id, adjustmentId);
  assert.equal((await recovery.listRecoveryMarkers()).length, 1);
});

test('corrupted marker storage fails closed and is never overwritten', async () => {
  store.set('stockroom.request-recovery.v1', 'not JSON');
  await assert.rejects(recovery.listRecoveryMarkers(), error => error.code === 'recoveryStorage');
  await assert.rejects(recovery.saveRecoveryMarker(marker()), error => error.code === 'recoveryStorage');
  assert.equal(store.get('stockroom.request-recovery.v1'), 'not JSON');
});

test('maps history sources and validates bounds; reason PATCH sends only reason', async () => {
  const row = { id: adjustmentId, productId, productName: 'Coffee', quantity: -2, reason: 'Sale', source: 'sale', createdAt: date };
  global.fetch = async () => response([row]);
  assert.deepEqual(await repo.listStockHistory(), [row]);
  for (const bad of [{ ...row, quantity: 2147483648 }, { ...row, source: 'other' }, { ...row, createdAt: 'x' }]) {
    global.fetch = async () => response([bad]);
    await assert.rejects(repo.listStockHistory(), error => error.code === 'apiResponseInvalid');
  }
  global.fetch = async (_url, init) => {
    assert.equal(init.method, 'PATCH'); assert.deepEqual(JSON.parse(init.body), { reason: null });
    return response({ ...saved(productId), reason: null });
  };
  assert.equal((await repo.updateStockReason(adjustmentId, null)).reason, null);
});


test('a new recovery module reads persisted markers after restart without a payload to resend', async () => {
  const previous = marker();
  await recovery.saveRecoveryMarker(previous);
  delete require.cache[require.resolve(path.join(output, 'api/requestRecovery.js'))];
  const restarted = require(path.join(output, 'api/requestRecovery.js'));
  assert.deepEqual(await restarted.listRecoveryMarkers(), [previous]);
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.method, undefined);
    assert.equal(init.body, undefined);
    return response(saved(previous.requestId));
  };
  assert.equal((await repo.lookupAdjustment(previous)).id, adjustmentId);
  await restarted.clearRecoveryMarker(previous);
  assert.equal(calls.length, 1);
  assert.deepEqual(await restarted.listRecoveryMarkers(), []);
});


test('missing native marker storage avoids the fatal package import and prevents a POST', async () => {
  storageAvailable = false;
  global.fetch = async () => { calls.push(1); throw new Error('must not send'); };
  await assert.rejects(recovery.listRecoveryMarkers(), error => error.code === 'recoveryNativeMissing');
  await assert.rejects(repo.adjustStock(productId, 2, 'Delivery'), error => error.code === 'recoveryNativeMissing');
  assert.equal(storageImports, 0);
  assert.equal(calls.length, 0);
});
