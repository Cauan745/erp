const assert = require('node:assert/strict');
const { test, beforeEach, afterEach, after } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const app = path.resolve(__dirname, '..');
const output = mkdtempSync(path.join(tmpdir(), 'stockroom-online-tests-'));
execFileSync(process.execPath, [path.join(app, 'node_modules/typescript/bin/tsc'),
  'src/app/useAppState.ts', '--outDir', output, '--strict', '--skipLibCheck', '--target', 'es2022',
  '--module', 'commonjs', '--types', 'node', '--typeRoots', 'node_modules/@types', '--esModuleInterop'
], { cwd: app, stdio: 'inherit' });

// These doubles execute startup/foreground effects and their cleanup, with stable callbacks.
// They test action ordering and state transitions, not React Native rendering.
let active, alerts, calls, listeners, harnesses, nativeTaskManager;
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const react = {
  useState(initial) {
    const h = active, i = h.index++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [h.slots[i], value => { h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value; }];
  },
  useRef(initial) { const h = active, i = h.index++; return h.slots[i] ?? (h.slots[i] = { current: initial }); },
  useMemo(fn, deps) {
    const h = active, i = h.index++;
    if (!h.slots[i] || !sameDeps(h.slots[i].deps, deps)) h.slots[i] = { deps, value: fn() };
    return h.slots[i].value;
  },
  useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  useEffect(fn, deps) {
    const h = active, i = h.index++;
    const previous = h.effects[i];
    if (!previous || !sameDeps(previous.deps, deps)) h.queued.push(() => {
      previous?.cleanup?.();
      h.effects[i] = { deps, cleanup: fn() };
    });
  }
};
const store = new Map();
const storage = { getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } };
const originalGet = storage.getItem;
const originalLoad = Module._load, originalFetch = global.fetch;
const translate = key => key;
const appState = {
  currentState: 'active',
  addEventListener(event, fn) { assert.equal(event, 'change'); listeners.add(fn); return { remove: () => listeners.delete(fn) }; }
};
Module._load = function(id, ...args) {
  if (id === 'expo') return { requireOptionalNativeModule: name => {
    assert.equal(name, 'ExpoTaskManager');
    return nativeTaskManager;
  } };
  if (id === 'react') return react;
  if (id === 'react-native') return { AppState: appState, TurboModuleRegistry: { get: () => ({}) },
    Alert: { alert: (title, message, buttons) => alerts.push({ title, message, buttons }) } };
  if (id === '@react-native-async-storage/async-storage') return storage;
  if (id === '../i18n') return { useI18n: () => ({ locale: 'pt-BR', t: translate }) };
  return originalLoad.call(this, id, ...args);
};
const { useAppState } = require(path.join(output, 'app/useAppState.js'));
const recovery = require(path.join(output, 'api/requestRecovery.js'));
const { API_BASE_URL } = require(path.join(output, 'api/client.js'));
const productId = '7da1f001-6292-4224-864e-e0817b6248d3';
const saleId = '0da1f001-6292-4224-864e-e0817b6248d3';
const otherId = '8da1f001-6292-4224-864e-e0817b6248d3';
const date = '2026-11-02T12:00:00Z';
const product = { id: productId, name: 'Coffee', barcode: '123', category: 'General', costCents: null,
  sellingPriceCents: 250, stock: 10, createdAt: date, updatedAt: date };
const adjustment = requestId => ({ id: otherId, requestId, productId, quantity: 1, reason: 'Count', createdAt: date });
const historyRow = { id: otherId, productId, productName: 'Coffee', quantity: 1, reason: 'Count', source: 'adjustment', createdAt: date };
const sale = requestId => ({ id: saleId, requestId, totalCents: 250, paymentMethod: 'pix', cashReceivedCents: null,
  changeCents: null, createdAt: date, items: [{ id: otherId, productId, lineNumber: 0, productName: 'Coffee', quantity: 1,
    unitPriceCents: 250, lineTotalCents: 250 }] });
const marker = (requestId = saleId, operationType = 'checkout', apiBaseUrl = API_BASE_URL) => ({ requestId, operationType, apiBaseUrl, submittedAt: date });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const reject = (code, status) => response({ error: { code } }, status);
function defaultRead(url) {
  if (url.endsWith('/products')) return response([product]);
  if (url.includes('/stock/history')) return response([historyRow]);
  if (url.endsWith('/sales')) return response([sale(saleId)]);
  throw new Error(`Unexpected URL ${url}`);
}
function serve(fn = defaultRead) {
  global.fetch = async (url, init) => { calls.push({ url, init }); return fn(url, init); };
}
function gate() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }
function harness() {
  const h = { slots: [], effects: [], queued: [], index: 0, render() {
    active = h; h.index = 0; h.queued = [];
    h.app = useAppState();
    for (const effect of h.queued) effect();
    return h.app;
  }, unmount() { for (const effect of h.effects) effect?.cleanup?.(); } };
  harnesses.push(h); h.render(); return h;
}
function foreground() {
  for (const state of ['background', 'active']) {
    appState.currentState = state;
    for (const fn of listeners) fn(state);
  }
}
beforeEach(() => { alerts = []; calls = []; store.clear(); listeners = new Set(); harnesses = []; nativeTaskManager = null; appState.currentState = 'active'; serve(); });
afterEach(async () => {
  for (const h of harnesses) h.unmount();
  await settle();
  storage.getItem = originalGet;
  global.fetch = originalFetch;
});
after(() => { Module._load = originalLoad; rmSync(output, { recursive: true, force: true }); });

test('startup loads lists and reminders independently even when the catalog is unavailable', async () => {
  const wait = gate();
  await recovery.saveRecoveryMarker(marker());
  serve(url => url.endsWith('/products') ? wait.promise : defaultRead(url));
  const h = harness();
  assert.equal(h.app.catalogLoading, true); assert.equal(h.app.catalogRefreshing, false);
  await settle(); h.render();
  assert.equal(h.app.catalogLoading, true); assert.equal(h.app.salesLoading, false); assert.equal(h.app.historyLoading, false);
  assert.equal(h.app.sales.length, 1); assert.equal(h.app.stockHistory.length, 1); assert.equal(h.app.markers.length, 1);
  assert.equal(h.app.checkoutBlocked, true); assert.equal(h.app.stockChangesBlocked, true);
  wait.reject(new TypeError('unavailable')); await settle(); h.render();
  assert.equal(h.app.catalogLoading, false); assert.equal(h.app.catalogError, 'errors.networkUnavailable');
  assert.equal(h.app.salesError, null); assert.equal(h.app.historyError, null);
  assert.ok(calls.every(c => c.init.method === undefined));
});

test('failed refresh retains every list and each retry has independent state and no overlapping read', async () => {
  const h = harness(); await settle(); h.render();
  serve(() => { throw new TypeError('disconnected'); });
  h.app.refresh(); h.render();
  assert.equal(h.app.catalogLoading, false); assert.equal(h.app.catalogRefreshing, true);
  assert.equal(h.app.salesRefreshing, true); assert.equal(h.app.historyRefreshing, true);
  await settle(); h.render();
  assert.equal(h.app.products.length, 1); assert.equal(h.app.sales.length, 1); assert.equal(h.app.stockHistory.length, 1);
  assert.ok(h.app.catalogError && h.app.salesError && h.app.historyError);
  const wait = gate(); serve(() => wait.promise); calls = [];
  h.app.retrySales(); h.app.retrySales(); h.render();
  assert.equal(calls.length, 1); assert.equal(h.app.salesRefreshing, true); assert.equal(h.app.catalogRefreshing, false);
  wait.resolve(response([])); await settle(); h.render();
  assert.equal(h.app.sales.length, 0); assert.equal(h.app.salesError, null);
  assert.ok(h.app.catalogError && h.app.historyError); assert.equal(h.app.products.length, 1);
});

test('foreground refreshes lists and markers without replay, skips repeated active events, and removes its listener', async () => {
  const h = harness(); await settle(); h.render(); h.render(); assert.equal(listeners.size, 1);
  const previous = marker(); await recovery.saveRecoveryMarker(previous);
  calls = []; foreground(); await settle(); h.render();
  assert.equal(calls.length, 3); assert.deepEqual(h.app.markers, [previous]);
  assert.ok(calls.every(c => !c.init.method && !c.init.body));
  for (const fn of listeners) fn('active'); await settle(); assert.equal(calls.length, 3);
  h.unmount(); assert.equal(listeners.size, 0);
});

test('foreground waits for an older read then fetches again without overlap', async () => {
  const h = harness(); await settle(); h.render(); calls = [];
  const old = gate(); let count = 0;
  serve(url => url.endsWith('/products') && ++count === 1 ? old.promise : defaultRead(url));
  h.app.retryCatalog(); foreground(); await settle();
  assert.equal(calls.filter(c => c.url.endsWith('/products')).length, 1);
  old.resolve(response([{ ...product, name: 'Old read' }])); await settle(); h.render();
  assert.equal(calls.filter(c => c.url.endsWith('/products')).length, 2);
  assert.equal(h.app.products[0].name, 'Coffee');
});

test('a product confirmation invalidates an old read and survives a failed fresh read', async () => {
  const h = harness(); await settle(); h.render();
  const old = gate(); let reads = 0, postStarted = false;
  serve((url, init) => {
    if (init.method === 'POST') { postStarted = true; return response({ ...product, id: otherId, name: 'Tea' }, 201); }
    if (url.endsWith('/products')) {
      if (++reads === 1) return old.promise;
      throw new TypeError('refresh failed');
    }
    return defaultRead(url);
  });
  h.app.retryCatalog(); h.app.openNewProduct(); h.render();
  h.app.setProductForm(form => ({ ...form, name: 'Tea', sellingPrice: '2.50' })); h.render();
  const pending = h.app.saveProduct(); await settle(); h.render();
  assert.equal(postStarted, true); assert.equal(h.app.products[0].name, 'Tea'); assert.equal(h.app.productFormOpen, false);
  old.resolve(response([product])); await pending; h.render();
  assert.equal(reads, 2); assert.equal(h.app.products.length, 2); assert.ok(h.app.catalogError);
  assert.ok(alerts.some(a => a.title === 'alerts.refreshFailedTitle'));
  assert.ok(!alerts.some(a => a.title === 'alerts.saveProductFailedTitle'));
});

test('stale sales reads cannot erase a confirmed checkout or turn refresh failure into checkout failure', async () => {
  const h = harness(); await settle(); h.render(); h.app.addToCart(h.app.products[0]); h.render();
  const old = gate(); let reads = 0;
  serve((url, init) => {
    if (init.method === 'POST') return response(sale(JSON.parse(init.body).requestId), 201);
    if (url.endsWith('/sales') && ++reads === 1) return old.promise;
    throw new TypeError('refresh failed');
  });
  h.app.retrySales(); const pending = h.app.completeCheckout('pix', null); await settle(); h.render();
  assert.equal(h.app.sales.length, 1); assert.equal(h.app.confirmedSale.id, saleId);
  old.resolve(response([])); await pending; h.render();
  assert.equal(h.app.sales.length, 1); assert.equal(h.app.cartQuantity, 0); assert.ok(h.app.salesError);
  assert.ok(alerts.some(a => a.title === 'sales.refreshFailed'));
  assert.ok(!alerts.some(a => a.title === 'alerts.completeSaleFailedTitle'));
});

test('metadata edits refresh adjustment names while sales keep their saved snapshots', async () => {
  const h = harness(); await settle(); h.render(); calls = [];
  serve((url, init) => init.method === 'PATCH' ? response({ ...product, name: 'New name' })
    : url.includes('/stock/history') ? response([{ ...historyRow, productName: 'New name' }])
      : response([{ ...product, name: 'New name' }]));
  h.app.editProduct(h.app.products[0]); h.render(); h.app.setProductForm(form => ({ ...form, name: 'New name' })); h.render();
  await h.app.saveProduct(); h.render();
  assert.equal(h.app.products[0].name, 'New name'); assert.equal(h.app.stockHistory[0].productName, 'New name');
  assert.equal(h.app.sales[0].lines[0].name, 'Coffee');
  assert.ok(!calls.some(c => c.url.endsWith('/sales')));
});

test('repeated delete confirmation callbacks send one DELETE and guard product actions while pending', async () => {
  const h = harness(); await settle(); h.render(); calls = [];
  const wait = gate(); serve((_url, init) => init.method === 'DELETE' ? wait.promise : response([]));
  h.app.deleteProduct(h.app.products[0]);
  const confirm = alerts.at(-1).buttons.find(b => b.text === 'common.delete').onPress;
  confirm(); confirm(); h.app.openNewProduct(); h.render();
  assert.equal(calls.length, 1); assert.equal(h.app.savingProduct, true); assert.equal(h.app.productFormOpen, false);
  wait.resolve(new Response(null, { status: 204 })); await settle(); h.render();
  assert.equal(h.app.products.length, 0); assert.equal(h.app.savingProduct, false);
});

test('failed product saves keep the form, reject repeat taps, and distinguish rejection from uncertainty', async () => {
  const h = harness(); await settle(); h.render(); h.app.openNewProduct(); h.render();
  h.app.setProductForm(form => ({ ...form, name: 'Tea', sellingPrice: '2,50', barcode: 'keep' })); h.render();
  const form = h.app.productForm, wait = gate(); serve(() => wait.promise); calls = [];
  const pending = h.app.saveProduct(); await h.app.saveProduct();
  h.app.setProductForm(current => ({ ...current, name: 'Blocked' })); h.app.closeProductForm(); h.render();
  assert.equal(calls.length, 1); assert.deepEqual(h.app.productForm, form); assert.equal(h.app.productFormOpen, true);
  wait.resolve(reject('barcode_taken', 409)); await pending; h.render();
  assert.deepEqual(h.app.productForm, form); assert.equal(alerts.at(-1).title, 'alerts.saveProductFailedTitle');
  serve(() => { throw new TypeError('lost response'); }); await h.app.saveProduct(); h.render();
  assert.equal(alerts.at(-1).title, 'recovery.uncertain'); assert.equal(alerts.at(-1).message, 'writes.uncertain');
  assert.deepEqual(h.app.productForm, form);
});

test('a failed stock form remains open when a refresh hides its product and duplicate submissions are guarded', async () => {
  const h = harness(); await settle(); h.render(); h.app.openStockAdjustment(productId); h.render();
  serve(url => url.endsWith('/products') ? response([]) : defaultRead(url)); h.app.retryCatalog(); await settle(); h.render();
  assert.equal(h.app.stockAdjustmentProduct.id, productId);
  const wait = gate(); serve(() => wait.promise); calls = [];
  const pending = h.app.saveStockAdjustment('1', 'Keep reason'); await settle();
  await h.app.saveStockAdjustment('1', 'Keep reason'); h.app.closeStockAdjustment(); h.render();
  assert.equal(h.app.savingStock, true); assert.equal(h.app.stockAdjustmentOpen, true); assert.equal(calls.length, 1);
  wait.resolve(reject('product_missing', 404)); await pending; h.render();
  assert.equal(h.app.stockAdjustmentOpen, true); assert.equal(h.app.savingStock, false);
  assert.deepEqual(await recovery.listRecoveryMarkers(), []); assert.equal(alerts.at(-1).title, 'alerts.updateStockFailedTitle');
});

test('reason edits preserve their editor on rejection and refresh only history after confirmation', async () => {
  const h = harness(); await settle(); h.render(); h.app.openStockReasonEdit(h.app.stockHistory[0]); h.render();
  serve(() => reject('validation_failed', 400));
  await h.app.saveStockReason('New reason'); h.render(); assert.equal(h.app.stockReasonEditOpen, true);
  calls = []; serve((_url, init) => init.method === 'PATCH' ? response({ ...adjustment(saleId), reason: 'New reason' })
    : response([{ ...historyRow, reason: 'New reason' }]));
  await h.app.saveStockReason('New reason'); h.render();
  assert.equal(h.app.stockReasonEditOpen, false); assert.equal(h.app.stockHistory[0].reason, 'New reason');
  assert.equal(calls.length, 2); assert.ok(calls[1].url.includes('/stock/history'));
});

test('barcode loading and retry stay independent, duplicate callbacks send one GET, and only a true miss offers registration', async () => {
  const h = harness(); await settle(); h.render(); calls = [];
  const wait = gate(); serve(() => wait.promise);
  h.app.openScanner('sell'); h.render(); const pending = h.app.onBarcode('123'); await h.app.onBarcode('123');
  h.render(); assert.equal(calls.length, 1); assert.equal(h.app.lookingUpBarcode, true); assert.equal(h.app.catalogRefreshing, false);
  await h.app.completeCheckout('pix', null); assert.equal(calls.length, 1);
  wait.reject(new TypeError('disconnected')); await pending; h.render();
  assert.equal(h.app.barcodeError, 'errors.networkUnavailable'); assert.equal(h.app.catalogError, null);
  assert.ok(!alerts.some(a => a.title === 'alerts.productNotFoundTitle'));
  serve(() => reject('product_missing', 404)); h.app.retryBarcode(); h.app.retryBarcode(); await settle(); h.render();
  assert.equal(calls.length, 2); assert.equal(h.app.barcodeError, null);
  assert.equal(alerts.at(-1).title, 'alerts.productNotFoundTitle'); assert.ok(calls.every(c => !c.init.method));
});

test('barcode completion uses the latest cart and closing the scanner invalidates a late result', async () => {
  const h = harness(); await settle(); h.render(); const wait = gate(); serve(() => wait.promise);
  h.app.openScanner('sell'); h.render(); const pending = h.app.onBarcode('123');
  h.app.addToCart({ ...h.app.products[0], stock: 1 }); h.render();
  wait.resolve(response({ ...product, stock: 1 })); await pending; h.render();
  assert.equal(h.app.cartQuantity, 1); assert.equal(alerts.at(-1).title, 'alerts.notEnoughStockTitle');
  const late = gate(); serve(() => late.promise); h.app.openScanner('sell'); h.render();
  const cancelled = h.app.onBarcode('123'); h.app.closeScanner(); late.resolve(response(product)); await cancelled; h.render();
  assert.equal(h.app.cartQuantity, 1);
});

test('a delayed shortage choice cannot edit the submitted cart or replenish during checkout', async () => {
  const h = harness(); await settle(); h.render(); h.app.addToCart(h.app.products[0]); h.render();
  h.app.updateQuantity(h.app.cartLines[0], 10);
  const buttons = alerts.at(-1).buttons;
  const wait = gate(); serve((_url, init) => init.method === 'POST' ? wait.promise : defaultRead(_url)); calls = [];
  const pending = h.app.completeCheckout('pix', null); await settle();
  buttons.find(b => b.text === 'sell.sellAnyway').onPress();
  buttons.find(b => b.text === 'alerts.addStockForSale').onPress(); h.render();
  assert.equal(h.app.cartQuantity, 1); assert.equal(calls.length, 1);
  wait.resolve(reject('cash_received_invalid', 422)); await pending; h.render();
  assert.equal(h.app.cartQuantity, 1); assert.equal(h.app.cartLocked, false);
});

test('uncertain checkout stays locked if marker reload fails and an unrelated request is confirmed', async () => {
  const h = harness(); await settle(); h.render(); h.app.addToCart(h.app.products[0]); h.render();
  serve(() => { storage.getItem = async () => { throw new Error('disk'); }; throw new TypeError('lost response'); });
  await h.app.completeCheckout('pix', null); h.render();
  assert.equal(h.app.cartLocked, true); assert.equal(h.app.cartQuantity, 1); assert.ok(h.app.recoveryError);
  assert.equal(h.app.checkoutBlocked, true); assert.equal(h.app.stockChangesBlocked, true);
  storage.getItem = originalGet;
  const [submitted] = await recovery.listRecoveryMarkers(); const unrelated = marker(otherId);
  await recovery.saveRecoveryMarker(unrelated);
  serve((url) => url.includes('/by-request-id/') ? response(sale(otherId)) : defaultRead(url));
  await h.app.checkPreviousRequest(unrelated); h.render();
  assert.equal(h.app.cartLocked, true); assert.equal(h.app.cartQuantity, 1);
  assert.deepEqual(await recovery.listRecoveryMarkers(), [submitted]);
  serve(url => url.includes('/by-request-id/') ? reject('request_not_found', 404) : defaultRead(url));
  await h.app.checkPreviousRequest(submitted); h.render();
  assert.equal(h.app.cartLocked, true); assert.deepEqual(await recovery.listRecoveryMarkers(), [submitted]);
});

test('a stale scanner callback from an earlier opening cannot consume a new scan', async () => {
  const h = harness(); await settle(); h.render(); calls = [];
  h.app.openScanner('sell'); h.render(); const oldCallback = h.app.onBarcode;
  h.app.closeScanner(); h.app.openScanner('product'); h.render();
  await oldCallback('old'); await h.app.onBarcode('new'); h.render();
  assert.equal(calls.length, 0); assert.equal(h.app.productForm.barcode, 'new'); assert.equal(h.app.cartQuantity, 0);
});

test('a server error on a read uses loading wording without implying that a mutation was submitted', async () => {
  serve(() => reject('internal_error', 500));
  const h = harness(); await settle(); h.render();
  assert.equal(h.app.catalogError, 'errors.readFailed'); assert.equal(h.app.historyError, 'errors.readFailed');
  assert.equal(h.app.salesError, 'errors.readFailed'); assert.equal(alerts.length, 0);
});

test('legacy upgrade cleanup removes only its task and preserves every recovery marker and stored value', async () => {
  await recovery.saveRecoveryMarker(marker());
  await recovery.saveRecoveryMarker(marker(otherId, 'adjustment', 'http://previous-server:8081'));
  store.set('existing-device-data', 'unchanged');
  const before = [...store];
  const registered = new Set(['stockroom-background-sync', 'unrelated-task']);
  const removed = [];
  nativeTaskManager = {
    isTaskRegisteredAsync: async name => registered.has(name),
    unregisterTaskAsync: async name => { removed.push(name); registered.delete(name); }
  };
  const h = harness(); await settle(); h.render();
  assert.deepEqual(removed, ['stockroom-background-sync']);
  assert.deepEqual([...registered], ['unrelated-task']);
  assert.deepEqual([...store], before);
  assert.equal(h.app.markers.length, 2);
  assert.equal(h.app.legacyTaskCleanupFailed, false);
  foreground(); await settle(); h.render();
  assert.deepEqual(removed, ['stockroom-background-sync']);
  assert.ok(calls.every(c => c.init.method === undefined));
});

test('legacy cleanup skips absent native modules and unregistered tasks without changing data', async () => {
  const h = harness(); await settle(); h.render();
  assert.equal(h.app.legacyTaskCleanupFailed, false);
  let checks = 0;
  nativeTaskManager = {
    isTaskRegisteredAsync: async name => { assert.equal(name, 'stockroom-background-sync'); checks++; return false; },
    unregisterTaskAsync: async () => assert.fail('No registered task to remove')
  };
  await h.app.retryLegacyTaskCleanup(); h.render();
  assert.equal(checks, 1);
  assert.equal(h.app.legacyTaskCleanupFailed, false);
  assert.equal(store.size, 0);
});

test('failed legacy cleanup stays visible with a manual retry and does not block API reads or recovery', async () => {
  await recovery.saveRecoveryMarker(marker());
  const before = [...store];
  let attempts = 0;
  nativeTaskManager = {
    isTaskRegisteredAsync: async () => { attempts++; throw new Error('native failure'); },
    unregisterTaskAsync: async () => assert.fail('Registration check failed')
  };
  const h = harness(); await settle(); h.render();
  assert.equal(h.app.legacyTaskCleanupFailed, true);
  assert.equal(h.app.products.length, 1); assert.equal(h.app.sales.length, 1); assert.equal(h.app.markers.length, 1);
  foreground(); h.app.refresh(); await settle(); h.render();
  assert.equal(attempts, 1);
  assert.deepEqual([...store], before);
  nativeTaskManager.isTaskRegisteredAsync = async () => false;
  await h.app.retryLegacyTaskCleanup(); h.render();
  assert.equal(h.app.legacyTaskCleanupFailed, false);
  assert.deepEqual([...store], before);
  assert.ok(calls.every(c => c.init.method === undefined));
});

test('legacy cleanup serializes repeated attempts and exposes unregister rejection', async () => {
  const wait = gate();
  let attempts = 0;
  nativeTaskManager = {
    isTaskRegisteredAsync: async () => true,
    unregisterTaskAsync: () => { attempts++; return wait.promise; }
  };
  const h = harness(); await settle(); h.render();
  await h.app.retryLegacyTaskCleanup(); await h.app.retryLegacyTaskCleanup();
  assert.equal(attempts, 1);
  wait.reject(new Error('cannot unregister')); await settle(); h.render();
  assert.equal(h.app.legacyTaskCleanupFailed, true);
});

test('legacy cleanup reports failure if the task is still registered after unregistration', async () => {
  nativeTaskManager = {
    isTaskRegisteredAsync: async () => true,
    unregisterTaskAsync: async () => {}
  };
  const h = harness(); await settle(); h.render();
  assert.equal(h.app.legacyTaskCleanupFailed, true);
  assert.equal(h.app.products.length, 1);
});
