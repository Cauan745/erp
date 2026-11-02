const assert = require('node:assert/strict');
const { test, beforeEach, afterEach, after } = require('node:test');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const app = path.resolve(__dirname, '..');
const output = mkdtempSync(path.join(tmpdir(), 'stockroom-product-tests-'));
execFileSync(process.execPath, [path.join(app, 'node_modules/typescript/bin/tsc'),
  'src/api/client.ts', 'src/repositories/product.ts', 'src/errors.ts',
  '--outDir', output, '--strict', '--skipLibCheck', '--target', 'es2022', '--module', 'commonjs',
  '--types', 'node', '--typeRoots', 'node_modules/@types'
], { cwd: app, stdio: 'inherit' });
const repo = require(path.join(output, 'repositories/product.js'));
const { ApiError, REQUEST_TIMEOUT_MS } = require(path.join(output, 'api/client.js'));
const { AppError } = require(path.join(output, 'errors.js'));
const originalFetch = global.fetch;
const sample = {
  id: '7da1f001-6292-4224-864e-e0817b6248d3', name: 'Coffee', barcode: null, category: 'General',
  costCents: 125, sellingPriceCents: 250, stock: 10,
  createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z'
};
let calls;
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => { calls = []; });
afterEach(() => { global.fetch = originalFetch; });
after(() => { rmSync(output, { recursive: true, force: true }); });
function serve(value, status = 200) {
  global.fetch = async (url, init) => { calls.push({ url, init }); return response(value, status); };
}

test('maps cents, nullable barcode/cost, and profit at the repository boundary', async () => {
  serve([sample, { ...sample, costCents: null }]);
  const products = await repo.listProducts();
  assert.equal(products[0].sellingPrice, 2.5);
  assert.equal(products[0].cost, 1.25);
  assert.equal(products[0].profit, 1.25);
  assert.equal(products[0].barcode, '');
  assert.equal(products[1].cost, null);
  assert.equal(products[1].profit, null);
  assert.equal('version' in products[0], false);
});

test('create sends normalized cents and signed opening stock once; PATCH excludes stock', async () => {
  serve(sample, 201);
  const input = { name: ' Coffee ', barcode: ' Code ', category: ' Drinks ', cost: null, sellingPrice: 2.55, stock: -5 };
  await repo.createProduct(input);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    name: 'Coffee', barcode: 'Code', category: 'Drinks', costCents: null, sellingPriceCents: 255, stock: -5
  });
  assert.equal(calls[0].init.method, 'POST');
  serve(sample);
  await repo.updateProduct(sample.id, input);
  assert.equal(calls[1].init.method, 'PATCH');
  assert.equal('stock' in JSON.parse(calls[1].init.body), false);
  assert.equal(calls.length, 2);
});

test('only a 404 product_missing is a barcode miss and the exact barcode is URL encoded', async () => {
  serve({ error: { code: 'product_missing', details: {} } }, 404);
  assert.equal(await repo.findProductByBarcode(' A&B/1 '), null);
  assert.match(calls[0].url, /barcode=A%26B%2F1$/);
  serve({ error: { code: 'request_not_found' } }, 404);
  await assert.rejects(repo.findProductByBarcode('x'), error => error instanceof ApiError && error.status === 404);
  serve({ error: { code: 'internal_error' } }, 500);
  await assert.rejects(repo.findProductByBarcode('x'), error => error instanceof ApiError && error.status === 500);
});

test('network errors remain retryable errors and never become lookup misses', async () => {
  global.fetch = async () => { calls.push(1); throw new TypeError('Network request failed'); };
  await assert.rejects(repo.findProductByBarcode('x'), error => error instanceof AppError && error.code === 'networkUnavailable');
  assert.equal(calls.length, 1);
});

test('timeout aborts exactly one POST without replay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  global.fetch = (_url, init) => {
    calls.push(init);
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  };
  const pending = repo.createProduct({ name: 'Coffee', barcode: '', category: '', cost: null, sellingPrice: 1 });
  const assertion = assert.rejects(pending, error => error instanceof AppError && error.code === 'requestTimeout');
  t.mock.timers.tick(REQUEST_TIMEOUT_MS);
  await assertion;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, true);
});

test('DELETE accepts empty 204 without trying to parse JSON', async () => {
  global.fetch = async (_url, init) => { calls.push(init); return new Response(null, { status: 204 }); };
  assert.equal(await repo.deleteProduct(sample.id), undefined);
  assert.equal(calls[0].method, 'DELETE');
});

test('malformed successful responses and invalid money/stock are rejected', async () => {
  for (const value of [{}, [{ ...sample, sellingPriceCents: 9007199254740992 }], [{ ...sample, costCents: -1 }]]) {
    serve(value);
    await assert.rejects(repo.listProducts(), error => error instanceof AppError && error.code === 'apiResponseInvalid');
  }
  const input = { name: 'Coffee', barcode: '', category: '', cost: null, sellingPrice: 1 };
  serve(sample);
  for (const stock of [1.5, 2147483648, -2147483649]) {
    await assert.rejects(repo.createProduct({ ...input, stock }), error => error.code === 'productStockInteger');
  }
  await assert.rejects(repo.createProduct({ ...input, sellingPrice: Number.MAX_SAFE_INTEGER }), error => error.code === 'productPrice');
  assert.equal(calls.length, 3);
});

test('timeout while receiving the JSON body remains a timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let parsing;
  const started = new Promise(resolve => { parsing = resolve; });
  global.fetch = async (_url, init) => ({
    status: 200, ok: true,
    json: () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('body aborted')));
      parsing();
    })
  });
  const pending = repo.listProducts();
  const assertion = assert.rejects(pending, error => error.code === 'requestTimeout');
  await started;
  t.mock.timers.tick(REQUEST_TIMEOUT_MS);
  await assertion;
});

test('the app import graph cannot reach SQLite repositories or sync workers', () => {
  const ts = require(path.join(app, 'node_modules/typescript'));
  const { readFileSync, existsSync } = require('node:fs');
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.doesNotMatch(file, /[/\\]src[/\\](sync|db)[/\\]/);
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function checkImport(name) {
      assert.doesNotMatch(name, /^(expo-sqlite|expo-background-task|expo-task-manager)(\/|$)/);
      if (!name.startsWith('.')) return;
      const base = path.resolve(path.dirname(file), name);
      const next = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find(existsSync);
      assert.ok(next, `Missing local import ${name} in ${file}`);
      visit(next);
    }
    function walk(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
          && ts.isStringLiteral(node.moduleSpecifier)) checkImport(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
          || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        assert.ok(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), 'Imports must be statically auditable');
        checkImport(node.arguments[0].text);
      }
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  visit(path.join(app, 'App.tsx'));
  assert.ok(visited.has(path.join(app, 'src/api/client.ts')));
  assert.ok(visited.has(path.join(app, 'src/api/requestRecovery.ts')));
  assert.ok(visited.has(path.join(app, 'src/api/ids.ts')));
  assert.ok(visited.has(path.join(app, 'src/app/legacyTaskCleanup.ts')));
});

test('removed packages and plugins are absent from manifests and lockfile', () => {
  const { readFileSync, existsSync } = require('node:fs');
  for (const name of ['package.json', 'package-lock.json', 'app.json']) {
    assert.doesNotMatch(readFileSync(path.join(app, name), 'utf8'), /expo-(sqlite|background-task|task-manager)/);
  }
  for (const name of ['src/db', 'src/sync', 'src/components/StartupScreen.tsx']) {
    assert.equal(existsSync(path.join(app, name)), false);
  }
});
