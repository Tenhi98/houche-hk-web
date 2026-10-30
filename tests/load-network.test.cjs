const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the production loader with controlled network/cache failures.
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const helpers = source.slice(source.indexOf('async function json('), source.indexOf('\nfunction index('));
const loader = source.slice(source.indexOf('// Catalogue loading:'), source.indexOf('\nasync function start('));
const data = { routeList: { route: { route: '1A' } }, stopList: { stop: { name: 'Test' } } };
const encoded = JSON.stringify(data);
const parts = Array.from({ length: 10 }, (_, i) => encoded.slice(Math.floor(i * encoded.length / 10), Math.floor((i + 1) * encoded.length / 10)));
const chunkIndex = url => Number(url.match(/part(\d+)\.txt$/)[1]);
const latestUrl = 'https://data.hkbus.app/routeFareList.min.json';

function harness(fetch, stored, options = {}) {
  let deleted = false;
  const cache = {
    async match() { return stored ? new Response(JSON.stringify(stored)) : undefined; },
    async put(key, response) { stored = await response.json(); },
    async delete() { deleted = true; stored = undefined; }
  };
  const context = vm.createContext({
    fetch, Response, AbortController, AbortSignal, Date,
    caches: { async open() { if (options.cacheDenied) throw Error('storage denied'); return cache; } },
    setTimeout: options.fastTimeout ? (fn, ms) => setTimeout(fn, Math.min(ms, 15)) : setTimeout,
    clearTimeout
  });
  vm.runInContext(helpers + '\n' + loader, context);
  return { load: () => context.loadNetwork(), deleted: () => deleted };
}

test('cold load uses three concurrent requests, assembles in order, and skips the absent monolithic file', async () => {
  let active = 0, peak = 0;
  const urls = [];
  const h = harness(async url => {
    urls.push(url); active++; peak = Math.max(peak, active);
    const i = chunkIndex(url);
    await new Promise(resolve => setTimeout(resolve, (3 - i % 3) * 3));
    active--;
    return new Response(parts[i]);
  });
  const result = await h.load();
  assert.equal(JSON.stringify(result.data), JSON.stringify(data));
  assert.equal(peak, 3);
  assert.equal(urls.length, 10);
  assert.ok(urls.every(url => url.startsWith('./parts/')));
  assert.equal(result.needsRefresh, true);
});

test('a valid warm cache works without a network and still requests background refresh', async () => {
  const h = harness(() => { throw Error('network must not be used'); }, { data, label: 'snapshot', savedAt: Date.now() });
  const result = await h.load();
  assert.equal(JSON.stringify(result.data), JSON.stringify(data));
  assert.equal(result.needsRefresh, true);
  assert.match(result.label, /快取/);
});

test('a corrupt cache is discarded before loading the bundled catalogue', async () => {
  const h = harness(async url => new Response(parts[chunkIndex(url)]), { data: { routeList: {}, stopList: {} }, savedAt: Date.now() });
  const result = await h.load();
  assert.equal(h.deleted(), true);
  assert.equal(JSON.stringify(result.data), JSON.stringify(data));
});

test('failed chunks cancel outstanding downloads and fall back to a live source', async () => {
  let aborted = 0;
  const urls = [];
  const h = harness((url, options) => {
    urls.push(url);
    if (url === latestUrl) return Promise.resolve(new Response(JSON.stringify(data)));
    if (chunkIndex(url) === 0) return Promise.resolve(new Response('', { status: 404 }));
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { aborted++; reject(Error('aborted')); }, { once: true }));
  });
  const result = await h.load();
  assert.equal(result.needsRefresh, false);
  assert.equal(aborted, 2);
  assert.ok(urls.includes(latestUrl));
});

test('stalled chunks time out and reach the second fallback if the first fails', async () => {
  const urls = [];
  const h = harness((url, options) => {
    urls.push(url);
    if (url === latestUrl) return Promise.reject(Error('CDN unavailable'));
    if (url.startsWith('https://hkbus.github.io/')) return Promise.resolve(new Response(JSON.stringify(data)));
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true }));
  }, undefined, { fastTimeout: true });
  const result = await h.load();
  assert.equal(JSON.stringify(result.data), JSON.stringify(data));
  assert.equal(result.needsRefresh, false);
  assert.ok(urls.some(url => url.startsWith('https://hkbus.github.io/')));
});

test('denied cache access does not prevent normal loading', async () => {
  const h = harness(async url => new Response(parts[chunkIndex(url)]), undefined, { cacheDenied: true });
  assert.equal(JSON.stringify((await h.load()).data), JSON.stringify(data));
});

test('all sources failing produces a recoverable error instead of invalid route data', async () => {
  const h = harness(async () => new Response('', { status: 503 }));
  await assert.rejects(h.load(), /no network data/);
});
