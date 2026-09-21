// Test harness: runs the built connector (the same text as dist/Code.js) in a Node vm
// context with stand ins for DataStudioApp, UrlFetchApp, PropertiesService,
// CacheService and Utilities. Two transports:
//   fixtureTransport()  answers from test/fixtures (captured from the live API with
//                       the demo key; Kalvenor is fictional sample data)
//   liveTransport()     calls the live API synchronously through a child process,
//                       at least 2.6 seconds apart (the demo key allows 30 a minute)

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { bundle } from '../scripts/build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(HERE, 'fixtures');
export const DEMO_KEY = 'bwp_demo_kalvenor_sample';

export function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name + '.json'), 'utf8'));
}

// ---------------------------------------------------------------------------
// DataStudioApp stand in. Mirrors the builder calls the connector makes and
// enforces the documented rules it relies on.
// ---------------------------------------------------------------------------

export class UserError extends Error {
  constructor(text, debugText) {
    super(text);
    this.name = 'UserError';
    this.userText = text;
    this.debugText = debugText;
  }
}

function makeFields(list) {
  const fields = {
    newDimension: () => newField('DIMENSION'),
    newMetric: () => newField('METRIC'),
    forIds(ids) {
      return makeFields(ids.map((id) => list.find((f) => f.id === id)).filter(Boolean));
    },
    asArray() {
      return list.map((f) => ({ getId: () => f.id, getType: () => f.type, isMetric: () => f.kind === 'METRIC' }));
    },
    build() {
      return list.map((f) => ({
        name: f.id,
        label: f.name,
        description: f.description,
        dataType: f.type === 'NUMBER' ? 'NUMBER' : f.type === 'BOOLEAN' ? 'BOOLEAN' : 'STRING',
        semantics: { conceptType: f.kind, semanticType: f.type },
        defaultAggregationType: f.aggregation,
      }));
    },
  };
  function newField(kind) {
    const f = { kind };
    list.push(f);
    const b = {
      setId(v) { f.id = v; return b; },
      setName(v) { f.name = v; return b; },
      setType(v) {
        if (!v) throw new Error('Unknown field type for ' + f.id);
        f.type = v;
        return b;
      },
      setDescription(v) { f.description = v; return b; },
      setAggregation(v) {
        if (kind !== 'METRIC') throw new Error('Aggregation set on a dimension: ' + f.id);
        if (!v) throw new Error('Unknown aggregation for ' + f.id);
        f.aggregation = v;
        return b;
      },
    };
    return b;
  }
  return fields;
}

function makeConfig() {
  const params = [];
  let stepped = null;
  function param(type) {
    const p = { type, options: [] };
    params.push(p);
    const b = {
      setId(v) { p.name = v; return b; },
      setName(v) { p.displayName = v; return b; },
      setHelpText(v) { p.helpText = v; return b; },
      setPlaceholder(v) { p.placeholder = v; return b; },
      setText(v) { p.text = v; return b; },
      setIsDynamic(v) { p.isDynamic = v; return b; },
      setAllowOverride(v) { p.parameterControl = { allowOverride: v }; return b; },
      addOption(o) { p.options.push(o._value); return b; },
    };
    return b;
  }
  return {
    newInfo: () => param('INFO'),
    newTextInput: () => param('TEXTINPUT'),
    newSelectSingle: () => param('SELECT_SINGLE'),
    newCheckbox: () => param('CHECKBOX'),
    newOptionBuilder() {
      const o = {};
      const b = { _value: o, setLabel(v) { o.label = v; return b; }, setValue(v) { o.value = v; return b; } };
      return b;
    },
    setIsSteppedConfig(v) { stepped = v; return this; },
    build() {
      for (const p of params) {
        if (p.isDynamic && p.parameterControl && p.parameterControl.allowOverride) {
          throw new Error('Dynamic parameters cannot be overridable: ' + p.name);
        }
      }
      return { configParams: params, isSteppedConfig: stepped };
    },
  };
}

export function makeDataStudioApp() {
  const FieldType = {};
  for (const t of ['TEXT', 'NUMBER', 'BOOLEAN', 'URL', 'YEAR_MONTH_DAY', 'PERCENT']) FieldType[t] = t;
  const AggregationType = {};
  for (const t of ['SUM', 'AVG', 'MAX', 'MIN', 'COUNT', 'NO_AGGREGATION', 'AUTO']) AggregationType[t] = t;
  const AuthType = {};
  for (const t of ['NONE', 'OAUTH2', 'KEY', 'USER_PASS', 'USER_TOKEN', 'PATH_USER_PASS', 'PATH_KEY']) AuthType[t] = t;
  const cc = {
    FieldType,
    AggregationType,
    AuthType,
    getFields: () => makeFields([]),
    getConfig: () => makeConfig(),
    newAuthTypeResponse() {
      const r = {};
      const b = {
        setAuthType(v) { r.type = v; return b; },
        setHelpUrl(v) { r.helpUrl = v; return b; },
        build: () => r,
      };
      return b;
    },
    newUserError() {
      let text = '';
      let debug = '';
      const b = {
        setText(v) { text = v; return b; },
        setDebugText(v) { debug = v; return b; },
        throwException() { throw new UserError(text, debug); },
      };
      return b;
    },
  };
  return { createCommunityConnector: () => cc };
}

// ---------------------------------------------------------------------------
// Apps Script service stand ins
// ---------------------------------------------------------------------------

function makeProperties() {
  const store = new Map();
  const props = {
    getProperty: (k) => (store.has(k) ? store.get(k) : null),
    setProperty(k, v) { store.set(k, String(v)); return props; },
    deleteProperty(k) { store.delete(k); return props; },
  };
  return { store, service: { getUserProperties: () => props } };
}

function makeCache(enabled) {
  const store = new Map();
  const cache = {
    get: (k) => (store.has(k) ? store.get(k) : null),
    put(k, v, seconds) {
      if (k.length > 250) throw new Error('Cache key too long');
      if (v.length > 100000) throw new Error('Cache value too large');
      if (!(seconds > 0 && seconds <= 21600)) throw new Error('Bad cache time');
      store.set(k, v);
    },
  };
  return { store, service: { getUserCache: () => (enabled ? cache : null) } };
}

function makeUtilities(sleeps) {
  return {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    computeDigest(alg, value) {
      if (alg !== 'SHA_256') throw new Error('Unexpected digest');
      // Apps Script returns signed bytes.
      return Array.from(createHash('sha256').update(value, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b));
    },
    sleep(ms) { sleeps.push(ms); },
  };
}

function lowerHeaderNames(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

function fixtureKey(path, cursor, scope) {
  return path + '|' + (cursor || '') + '|' + (scope || '');
}

// Answers from test/fixtures. The limit parameter is ignored so captured small pages
// stand in for limit=100 pages. The second displacement and sources pages end the
// chain (their next_cursor is set to null) so paging tests see exactly two pages.
export function fixtureTransport(overrides) {
  const table = new Map();
  const endChain = new Set(['displacement-page2', 'sources-page2']);
  for (const file of readdirSync(FIXTURES)) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -5);
    if (name.startsWith('error-') || name === 'runs-all' || name === 'summary-with-adaptive') continue;
    const f = fixture(name);
    const u = new URL('https://x' + f.request.replace(/^GET /, ''));
    const res = { status: f.status, headers: f.headers, body: structuredClone(f.body) };
    if (endChain.has(name)) res.body.pagination.next_cursor = null;
    table.set(fixtureKey(u.pathname, u.searchParams.get('cursor'), u.searchParams.get('scope')), res);
  }
  const extra = overrides || {};
  return function (url, headers) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api\/v1/, '');
    const key = fixtureKey(path, u.searchParams.get('cursor'), u.searchParams.get('scope'));
    if (extra[key]) return typeof extra[key] === 'function' ? extra[key](url, headers) : extra[key];
    if (headers.Authorization !== 'Bearer ' + DEMO_KEY) {
      const f = fixture('error-401');
      return { status: f.status, headers: f.headers, body: f.body };
    }
    if (table.has(key)) return table.get(key);
    const f = fixture(/\/runs\/[^/]+\//.test(path) ? 'error-404-run' : 'error-404-account');
    return { status: f.status, headers: f.headers, body: f.body };
  };
}

// Calls the live API. Synchronous, because the connector is: a child process does the fetch.
export function liveTransport(options) {
  const spacing = (options && options.spacingMs) || 2600;
  let last = 0;
  const script = [
    'const [url, auth] = process.argv.slice(1);',
    'const res = await fetch(url, { headers: { authorization: auth, accept: "application/json" }, redirect: "manual" });',
    'const headers = {}; res.headers.forEach((v, k) => { headers[k] = v; });',
    'process.stdout.write(JSON.stringify({ status: res.status, headers, text: await res.text() }));',
  ].join('\n');
  return function (url, headers) {
    const wait = last + spacing - Date.now();
    if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    last = Date.now();
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script, url, headers.Authorization], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    last = Date.now();
    return JSON.parse(out);
  };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

let cachedSource = null;
export async function connectorSource() {
  if (!cachedSource) cachedSource = await bundle();
  return cachedSource;
}

// Loads a fresh connector. transport(url, headers) returns
// { status, headers, body } or { status, headers, text }, or throws for a network error.
export async function loadConnector(options) {
  const o = options || {};
  const calls = [];
  const sleeps = [];
  const properties = makeProperties();
  const cache = makeCache(o.cache !== false);
  const transport = o.transport || fixtureTransport();
  const UrlFetchApp = {
    fetch(url, params) {
      if (!params || params.muteHttpExceptions !== true) throw new Error('muteHttpExceptions must be true');
      calls.push(url);
      const r = transport(url, params.headers || {});
      const text = r.text !== undefined ? r.text : r.body === undefined ? '' : JSON.stringify(r.body);
      const hdrs = lowerHeaderNames(r.headers);
      return {
        getResponseCode: () => r.status,
        getContentText: () => text,
        getHeaders: () => hdrs,
      };
    },
  };
  const context = vm.createContext({
    DataStudioApp: makeDataStudioApp(),
    UrlFetchApp,
    PropertiesService: properties.service,
    CacheService: cache.service,
    Utilities: makeUtilities(sleeps),
    console,
  });
  vm.runInContext(await connectorSource(), context, { filename: 'dist/Code.js' });
  if (o.key) properties.service.getUserProperties().setProperty('dscc.key', o.key);
  return { g: context, calls, sleeps, properties: properties.store, cache: cache.store };
}

// Every field id the connector declares for a data set, as a getData request would list them.
export function allFields(g, dataset) {
  return Array.from(g.BwSchema.fieldIds(dataset)).map((name) => ({ name }));
}
