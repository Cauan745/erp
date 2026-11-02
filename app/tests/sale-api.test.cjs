const assert = require('node:assert/strict');
const { test, beforeEach, afterEach, after } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const app = path.resolve(__dirname, '..');
const output = mkdtempSync(path.join(tmpdir(), 'stockroom-sale-tests-'));
execFileSync(process.execPath, [path.join(app, 'node_modules/typescript/bin/tsc'),
  'src/repositories/sale.ts', 'src/app/useAppState.ts', '--outDir', output, '--strict', '--skipLibCheck',
  '--target', 'es2022', '--module', 'commonjs', '--types', 'node', '--typeRoots', 'node_modules/@types', '--esModuleInterop'
], { cwd: app, stdio: 'inherit' });
const store = new Map();
const storage = { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } };
const originalSet = storage.setItem;
const originalLoad = Module._load;
let alerts, choose, active;
// Exercise hook actions without a native renderer. Effects are left to device checks;
// state slots and refs persist across explicit renders, including asynchronous handlers.
const react = {
  useState(initial) {
    const h = active, i = h.index++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [h.slots[i], next => { h.slots[i] = typeof next === 'function' ? next(h.slots[i]) : next; }];
  },
  useRef(initial) { const h = active, i = h.index++; return h.slots[i] ?? (h.slots[i] = { current: initial }); },
  useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {}
};
Module._load = function(id, ...args) {
  if (id === 'expo') return { requireOptionalNativeModule: () => null };
  if (id === 'react') return react;
  if (id === 'react-native') return { TurboModuleRegistry: { get: () => ({}) }, Alert: {
    alert: (title, message, buttons) => {
      alerts.push({ title, message, buttons });
      if (buttons && choose) choose(title, buttons);
    }
  } };
  if (id === '@react-native-async-storage/async-storage') return storage;
  if (id === '../i18n') return { useI18n: () => ({ locale: 'pt-BR', t: key => key }) };
  return originalLoad.call(this, id, ...args);
};
const repo = require(path.join(output, 'repositories/sale.js'));
const recovery = require(path.join(output, 'api/requestRecovery.js'));
const { ApiError, API_BASE_URL, REQUEST_TIMEOUT_MS } = require(path.join(output, 'api/client.js'));
const { parseMoneyToCents } = require(path.join(output, 'formatters.js'));
const { useAppState } = require(path.join(output, 'app/useAppState.js'));
function harness() {
  const h = { slots: [], index: 0, render() { active = h; h.index = 0; h.app = useAppState(); return h.app; } };
  h.render(); return h;
}
const originalFetch = global.fetch;
const productId = '7da1f001-6292-4224-864e-e0817b6248d3';
const otherId = '8da1f001-6292-4224-864e-e0817b6248d3';
const saleId = '0da1f001-6292-4224-864e-e0817b6248d3';
const date = '2026-11-02T12:00:00Z';
const line = (id = productId) => ({ productId: id, name: 'Coffee', quantity: 2, unitPrice: 2.5, unitPriceCents: 250, lineTotal: 5 });
const product = (id = productId) => ({ id, name: 'Coffee', sellingPrice: 2.5, sellingPriceCents: 250, stock: 100, barcode: '', category: 'General', cost: null, profit: null, createdAt: date, updatedAt: date });
const input = () => repo.checkoutInput([line()], 'pix', null);
const marker = (id = saleId, base = 'http://previous-server:8081') => ({ requestId: id, operationType: 'checkout', apiBaseUrl: base, submittedAt: date });
const saved = requestId => ({ id: saleId, requestId, totalCents: 500, paymentMethod: 'pix', cashReceivedCents: null,
  changeCents: null, createdAt: date, items: [{ id: saleId, productId, lineNumber: 0, productName: 'Original name', quantity: 2,
    unitPriceCents: 250, lineTotalCents: 500 }] });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const conflict = () => ({ error: { code: 'total_changed', details: { expectedTotalCents: 500, actualTotalCents: 550,
  items: [{ productId, productName: 'Renamed', quantity: 2, unitPriceCents: 275, lineTotalCents: 550 }] } } });
const shortage = (id = productId, requested = 2) => ({ productId: id, productName: 'Coffee', requested, available: 0 });
let calls;
beforeEach(() => { calls = []; alerts = []; choose = null; store.clear(); });
afterEach(() => { global.fetch = originalFetch; storage.setItem = originalSet; });
after(() => { Module._load = originalLoad; rmSync(output, { recursive: true, force: true }); });

test('checkout waits for a minimal durable marker and posts once with integer cents and explicit overrides', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  storage.setItem = async (key, value) => { entered(); await gate; return originalSet(key, value); };
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    const body = JSON.parse(init.body);
    const markers = await recovery.listRecoveryMarkers();
    assert.deepEqual(Object.keys(markers[0]).sort(), ['apiBaseUrl', 'operationType', 'requestId', 'submittedAt']);
    assert.equal(markers[0].operationType, 'checkout'); assert.equal(markers[0].requestId, body.requestId);
    assert.deepEqual(body, { requestId: body.requestId, ...input(), allowInsufficientStockProductIds: [productId] });
    return response(saved(body.requestId), 201);
  };
  const pending = repo.checkout({ ...input(), allowInsufficientStockProductIds: [productId] });
  await started; assert.equal(calls.length, 0); release();
  const result = await pending;
  assert.equal(result.lines[0].name, 'Original name'); assert.equal(result.lines[0].lineTotal, 5);
  assert.equal(result.total, 5); assert.equal(calls.length, 1);
  assert.deepEqual(await recovery.listRecoveryMarkers(), []);
});

test('storage failure prevents checkout and preserves markers from both operation types', async () => {
  const a = marker(), b = { ...marker(productId), operationType: 'adjustment' };
  await recovery.saveRecoveryMarker(a); await recovery.saveRecoveryMarker(b);
  storage.setItem = async () => { throw new Error('disk'); };
  global.fetch = async () => { calls.push(1); throw new Error('must not post'); };
  await assert.rejects(repo.checkout(input()), error => error.code === 'recoveryStorage');
  assert.equal(calls.length, 0); assert.deepEqual(await recovery.listRecoveryMarkers(), [a, b]);
});

test('timeout and restart retain checkout marker; recorded-backend lookup 404 never replays', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let sent; const started = new Promise(resolve => { sent = resolve; });
  global.fetch = (_url, init) => { calls.push(init); sent(); return new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('abort')))); };
  const pending = assert.rejects(repo.checkout(input()), error => error.code === 'requestTimeout');
  await started; t.mock.timers.tick(REQUEST_TIMEOUT_MS); await pending;
  const [outstanding] = await recovery.listRecoveryMarkers(); assert.equal(outstanding.operationType, 'checkout');
  delete require.cache[require.resolve(path.join(output, 'api/requestRecovery.js'))];
  const restarted = require(path.join(output, 'api/requestRecovery.js'));
  assert.deepEqual(await restarted.listRecoveryMarkers(), [outstanding]);
  const previous = { ...outstanding, apiBaseUrl: 'http://recorded-server:8081' };
  global.fetch = async (url, init) => {
    calls.push(init); assert.match(url, /^http:\/\/recorded-server:8081\/api\/v1\/sales\/by-request-id\//);
    assert.equal(init.method, undefined); assert.equal(init.body, undefined);
    return response({ error: { code: 'request_not_found' } }, 404);
  };
  await assert.rejects(repo.lookupSale(previous), error => error.code === 'request_not_found');
  assert.deepEqual(await restarted.listRecoveryMarkers(), [outstanding]); assert.equal(calls.length, 2);
  global.fetch = async () => response(saved(previous.requestId));
  assert.equal((await repo.lookupSale(previous)).id, saleId);
  await restarted.clearRecoveryMarker(outstanding); assert.deepEqual(await restarted.listRecoveryMarkers(), []);
});

test('definitive shortage price and payment rollback remove only their marker; malformed conflicts remain unresolved', async () => {
  const previous = marker(); await recovery.saveRecoveryMarker(previous);
  for (const [body, status] of [[conflict(), 409], [{ error: { code: 'insufficient_stock', details: { shortages: [shortage()] } } }, 409],
      [{ error: { code: 'cash_received_invalid' } }, 422]]) {
    global.fetch = async () => response(body, status);
    await assert.rejects(repo.checkout(input()), error => error instanceof ApiError);
    assert.deepEqual(await recovery.listRecoveryMarkers(), [previous]);
  }
  for (const [body, status] of [[{}, 201], [{ error: { code: 'internal_error' } }, 500],
      [{ error: { code: 'total_changed', details: {} } }, 409], [{ error: { code: 'insufficient_stock', details: {} } }, 409]]) {
    global.fetch = async () => response(body, status); await assert.rejects(repo.checkout(input()));
  }
  assert.equal((await recovery.listRecoveryMarkers()).length, 5);
});

test('a valid-looking success with a different submitted total keeps recovery unresolved', async () => {
  global.fetch = async (_url, init) => response({ ...saved(JSON.parse(init.body).requestId), totalCents: 600,
    items: [{ ...saved(saleId).items[0], lineTotalCents: 600 }] }, 201);
  await assert.rejects(repo.checkout(input()), error => error.code === 'apiResponseInvalid');
  assert.equal((await recovery.listRecoveryMarkers()).length, 1);
});

test('cleanup failure after a confirmed sale still returns success', async () => {
  let writes = 0;
  storage.setItem = async (key, value) => { if (++writes > 1) throw new Error('disk'); return originalSet(key, value); };
  global.fetch = async (_url, init) => response(saved(JSON.parse(init.body).requestId), 201);
  assert.equal((await repo.checkout(input())).id, saleId); assert.equal((await recovery.listRecoveryMarkers()).length, 1);
});

test('cash change uses authoritative integer cents even when decimal subtraction loses precision', async () => {
  const total = Number.MAX_SAFE_INTEGER - 1;
  global.fetch = async () => response([{ ...saved(saleId), totalCents: total, paymentMethod: 'cash',
    cashReceivedCents: Number.MAX_SAFE_INTEGER, changeCents: 1,
    items: [{ ...saved(saleId).items[0], quantity: 1, unitPriceCents: total, lineTotalCents: total }] }]);
  assert.equal((await repo.listSales())[0].change, 0.01);
});

test('sales DTOs preserve independent line totals and reject invalid money payment and line order', async () => {
  const s = saved(saleId);
  global.fetch = async () => response([{ ...s, items: [{ ...s.items[0], unitPriceCents: 200 }] }]);
  assert.equal((await repo.listSales())[0].lines[0].lineTotal, 5);
  for (const invalid of [{ ...s, totalCents: Number.MAX_SAFE_INTEGER + 1 }, { ...s, paymentMethod: 'credit' },
      { ...s, cashReceivedCents: 500 }, { ...s, items: [{ ...s.items[0], lineNumber: 1 }] },
      { ...s, items: [{ ...s.items[0], quantity: 0 }] }, { ...s, changeCents: 1 }]) {
    global.fetch = async () => response([invalid]); await assert.rejects(repo.listSales(), error => error.code === 'apiResponseInvalid');
  }
  global.fetch = async () => response([]); assert.deepEqual(await repo.listSales(), []);
});

test('checkout validates integer cents and retains cents exactly near the safe-integer bound', () => {
  assert.equal(repo.checkoutInput([{ ...line(), quantity: 1, unitPriceCents: Number.MAX_SAFE_INTEGER,
    unitPrice: Number.MAX_SAFE_INTEGER / 100 }], 'pix', null).expectedTotalCents, Number.MAX_SAFE_INTEGER);
  assert.throws(() => repo.checkoutInput([{ ...line(), unitPriceCents: Number.MAX_SAFE_INTEGER }], 'pix', null), error => error.code === 'productPrice');
  assert.throws(() => repo.checkoutInput([line()], 'cash', 499), error => error.code === 'cashReceivedInvalid');
  assert.throws(() => repo.checkoutInput([line()], 'pix', 500), error => error.code === 'cashReceivedInvalid');
  assert.throws(() => repo.checkoutInput([{ ...line(), quantity: 1.5 }], 'pix', null), error => error.code === 'saleQuantityPositive');
  assert.equal(parseMoneyToCents('90071992547409,91'), Number.MAX_SAFE_INTEGER);
  assert.equal(parseMoneyToCents('90071992547409.91', 'en'), Number.MAX_SAFE_INTEGER);
  assert.equal(parseMoneyToCents('90071992547409,92'), null);
  assert.equal(parseMoneyToCents('.50', 'en'), 50);
  assert.equal(parseMoneyToCents('1.234,56'), 123456);
  assert.equal(parseMoneyToCents('1,234.56', 'en'), 123456);
});

function cartHarness(ids = [productId]) {
  const h = harness();
  for (const id of ids) { h.app.addToCart(product(id)); h.render(); h.app.addToCart(product(id)); h.render(); }
  return h;
}
function serveReads(url, latest) {
  if (url.endsWith('/sales')) return response(latest ? [latest] : []);
  return response([]);
}

test('hook synchronously guards duplicate confirms and cart edits; failed refresh cannot fail a confirmed sale', async () => {
  const h = cartHarness();
  let sent, release; const started = new Promise(resolve => { sent = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST') { sent(); await gate; return response(saved(JSON.parse(init.body).requestId), 201); }
    throw new TypeError('offline refresh');
  };
  const pending = h.app.completeCheckout('pix', null);
  await started;
  h.app.addToCart(product()); h.app.updateQuantity(h.app.cartLines[0], 1);
  await h.app.completeCheckout('pix', null); h.render();
  assert.equal(h.app.cartQuantity, 2); assert.equal(h.app.savingCheckout, true);
  release(); await pending; h.render();
  assert.equal(calls.filter(c => c.init.method === 'POST').length, 1);
  assert.equal(h.app.cartQuantity, 0); assert.equal(h.app.sales.length, 1);
  assert.equal(h.app.confirmedSale.id, saleId); assert.equal(h.app.savingCheckout, false);
  assert.ok(alerts.some(a => a.title === 'sales.refreshFailed'));
  assert.ok(!alerts.some(a => a.title === 'alerts.completeSaleFailedTitle'));
});

test('price conflict revises the cart but requires another explicit confirm with a new request ID', async () => {
  const h = cartHarness(); let latest;
  global.fetch = async (url, init) => {
    if (init.method !== 'POST') return serveReads(url, latest);
    calls.push(JSON.parse(init.body));
    if (calls.length === 1) return response(conflict(), 409);
    latest = { ...saved(calls[1].requestId), totalCents: 550, items: [{ ...saved(saleId).items[0], unitPriceCents: 275, lineTotalCents: 550 }] };
    return response(latest, 201);
  };
  await h.app.completeCheckout('pix', null); h.render();
  assert.equal(calls.length, 1); assert.equal(h.app.cartQuantity, 2); assert.equal(h.app.cartTotalCents, 550);
  assert.equal(h.app.cartLines[0].name, 'Renamed'); assert.equal(h.app.cartLines[0].unitPriceCents, 275);
  assert.deepEqual(await recovery.listRecoveryMarkers(), []);
  await h.app.completeCheckout('pix', null); h.render();
  assert.equal(calls[1].expectedTotalCents, 550); assert.notEqual(calls[0].requestId, calls[1].requestId);
  assert.equal(h.app.cartQuantity, 0);
});

test('shortage choices accumulate explicit overrides and each revised checkout gets a new ID', async () => {
  const h = cartHarness([productId, otherId]);
  choose = (_title, buttons) => buttons.find(b => b.text === 'sell.sellAnyway').onPress();
  global.fetch = async (url, init) => {
    if (init.method !== 'POST') return serveReads(url);
    const body = JSON.parse(init.body); calls.push(body);
    const remaining = body.items.filter(i => !body.allowInsufficientStockProductIds.includes(i.productId));
    // Cancel after both approvals to prove the full set is sent and retained in the cart.
    if (!remaining.length) return response({ error: { code: 'cash_received_invalid' } }, 422);
    return response({ error: { code: 'insufficient_stock', details: { shortages: remaining.map(i => shortage(i.productId)) } } }, 409);
  };
  await h.app.completeCheckout('pix', null); h.render();
  assert.deepEqual(calls.map(c => c.allowInsufficientStockProductIds), [[], [productId], [productId, otherId]]);
  assert.equal(new Set(calls.map(c => c.requestId)).size, 3); assert.equal(h.app.cartQuantity, 4);
  assert.ok(h.app.cartLines.every(l => l.allowInsufficientStock));
  assert.deepEqual(await recovery.listRecoveryMarkers(), []);
});

test('replenishment commits before revised checkout and remains when the sale later fails', async () => {
  const h = cartHarness();
  choose = (_title, buttons) => buttons.find(b => b.text === 'alerts.addStockForSale').onPress();
  global.fetch = async (url, init) => {
    if (init.method !== 'POST') return serveReads(url);
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.includes('/products/')) return response({ id: saleId, requestId: body.requestId, productId, quantity: body.quantity,
      reason: body.reason, createdAt: date }, 201);
    if (calls.length === 1) return response({ error: { code: 'insufficient_stock', details: { shortages: [shortage()] } } }, 409);
    return response({ error: { code: 'product_missing' } }, 404);
  };
  await h.app.completeCheckout('pix', null); h.render();
  assert.equal(calls.length, 3); assert.match(calls[1].url, /\/products\//);
  assert.equal(calls[1].body.reason, 'sale-shortage-replenishment'); assert.equal(calls[1].body.quantity, 2);
  assert.match(calls[2].url, /\/checkout$/); assert.notEqual(calls[0].body.requestId, calls[2].body.requestId);
  assert.equal(h.app.cartQuantity, 2); assert.deepEqual(await recovery.listRecoveryMarkers(), []);
});

test('cancelled shortage preserves the cart without adjustments or further checkouts', async () => {
  const h = cartHarness(); choose = (_title, buttons) => buttons.find(b => b.text === 'common.cancel').onPress();
  global.fetch = async (_url, init) => { calls.push(init); return response({ error: { code: 'insufficient_stock', details: { shortages: [shortage()] } } }, 409); };
  await h.app.completeCheckout('pix', null); h.render();
  assert.equal(calls.length, 1); assert.equal(h.app.cartQuantity, 2); assert.equal(h.app.savingCheckout, false);
});

test('uncertain checkout preserves and locks cart; lookup 404 keeps marker and blocks any replacement', async () => {
  const h = cartHarness();
  global.fetch = async (_url, init) => { calls.push(init); throw new TypeError('lost response'); };
  await h.app.completeCheckout('pix', null); h.render();
  assert.equal(h.app.cartQuantity, 2); assert.equal(h.app.cartLocked, true);
  h.app.addToCart(product()); h.app.updateQuantity(h.app.cartLines[0], -1);
  await h.app.completeCheckout('pix', null); h.render(); assert.equal(calls.length, 1); assert.equal(h.app.cartQuantity, 2);
  const [m] = await recovery.listRecoveryMarkers();
  global.fetch = async (_url, init) => { calls.push(init); return response({ error: { code: 'request_not_found' } }, 404); };
  await h.app.checkPreviousRequest(m); h.render();
  assert.equal(h.app.cartQuantity, 2); assert.equal(h.app.cartLocked, true); assert.deepEqual(await recovery.listRecoveryMarkers(), [m]);
  global.fetch = async (url, init) => { calls.push(init); return url.includes('/by-request-id/') ? response(saved(m.requestId)) : serveReads(url, saved(m.requestId)); };
  await h.app.checkPreviousRequest(m); h.render();
  assert.equal(h.app.cartQuantity, 0); assert.equal(h.app.confirmedSale.id, saleId);
  assert.equal(calls.filter(c => c.method === 'POST').length, 1); assert.deepEqual(await recovery.listRecoveryMarkers(), []);
});

test('recovery from another backend shows its sale without inserting it into current-backend history or clearing a new cart', async () => {
  const h = cartHarness(), m = marker(); await recovery.saveRecoveryMarker(m);
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return url.startsWith(m.apiBaseUrl) ? response(saved(m.requestId)) : serveReads(url);
  };
  await h.app.checkPreviousRequest(m); h.render();
  assert.equal(h.app.confirmedSale.id, saleId); assert.equal(h.app.sales.length, 0); assert.equal(h.app.cartQuantity, 2);
  assert.equal(calls[0].url, `${m.apiBaseUrl}/api/v1/sales/by-request-id/${m.requestId}`);
  assert.ok(calls.every(c => c.init.method !== 'POST')); assert.deepEqual(await recovery.listRecoveryMarkers(), []);
});
