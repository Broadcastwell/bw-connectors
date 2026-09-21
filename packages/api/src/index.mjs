// @broadcastwell/api: a small, dependency free client for the Broadcastwell API.
// Source of truth for the ESM build. dist/index.cjs and dist/broadcastwell.global.js
// are produced from this file, constants.mjs and routes.mjs by scripts/build.mjs.
// Keep the code ES2019 and free of runtime specific APIs beyond fetch and WebCrypto.

import {
  DEMO_KEY,
  SAMPLE_ACCOUNT,
  ENGINES,
  EVENT_TYPES,
  SIGNATURE_TOLERANCE_SECONDS,
  WEBHOOK_HEADERS,
} from './constants.mjs';
import { API_VERSION, DEFAULT_BASE_URL, ENGINE_IDS, routes } from './routes.mjs';

const VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class BroadcastwellApiError extends Error {
  constructor(init) {
    const detail = init.detail || init.title || 'Request failed';
    super(init.status ? 'Broadcastwell API ' + init.status + ' ' + (init.code || 'error') + ': ' + detail : detail);
    this.name = 'BroadcastwellApiError';
    this.status = init.status || 0;
    this.code = init.code || (init.status ? 'http_' + init.status : 'network_error');
    this.detail = detail;
    this.title = init.title || '';
    this.type = init.type || '';
    this.retryAfter = init.retryAfter === undefined ? null : init.retryAfter;
    this.url = init.url || '';
    this.body = init.body === undefined ? null : init.body;
  }
}

// ---------------------------------------------------------------------------
// Routes: path and query building shared by every connector
// ---------------------------------------------------------------------------

function resolveRoute(route) {
  if (typeof route === 'string') {
    const found = routes[route];
    if (!found) throw new TypeError('Unknown Broadcastwell route: ' + route);
    return found;
  }
  return route;
}

function buildPath(route, params) {
  const r = resolveRoute(route);
  const p = params || {};
  return r.path.replace(/\{([A-Za-z_]+)\}/g, function (_, name) {
    const value = p[name];
    if (value === undefined || value === null || value === '') {
      throw new TypeError(r.name + ' needs the ' + name + ' parameter');
    }
    return encodeURIComponent(String(value));
  });
}

function buildQuery(route, params) {
  const r = resolveRoute(route);
  const p = params || {};
  const parts = [];
  for (let i = 0; i < r.queryParams.length; i++) {
    const name = r.queryParams[i].name;
    const value = p[name];
    if (value === undefined || value === null || value === '') continue;
    parts.push(encodeURIComponent(name) + '=' + encodeURIComponent(String(value)));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// ---------------------------------------------------------------------------
// Response metadata (status, ETag, RateLimit headers) without touching bodies
// ---------------------------------------------------------------------------

const metaStore = new WeakMap();

function getResponseMeta(body) {
  if (!body || typeof body !== 'object') return undefined;
  return metaStore.get(body);
}

function isNotModified(value) {
  return Boolean(value && typeof value === 'object' && value.notModified === true && !('data' in value));
}

function headerNumber(headers, name) {
  const v = headers && typeof headers.get === 'function' ? headers.get(name) : null;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function headerValue(headers, name) {
  return headers && typeof headers.get === 'function' ? headers.get(name) : null;
}

function defaultSleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function createClient(options) {
  const opts = options || {};
  if (!opts.apiKey || typeof opts.apiKey !== 'string') {
    throw new TypeError('createClient needs an apiKey. Try the public demo key ' + DEMO_KEY + '.');
  }
  const baseUrl = String(opts.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetchImpl = opts.fetch || (typeof fetch === 'function' ? fetch : undefined);
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('No fetch implementation found. Pass one as createClient({ fetch }).');
  }
  const account = opts.account || (opts.apiKey === DEMO_KEY ? SAMPLE_ACCOUNT : 'me');
  const userAgent = opts.userAgent || '@broadcastwell/api/' + VERSION;
  const retryOn429 = opts.retryOn429 !== false;
  const maxRetryAfter = opts.maxRetryAfterSeconds === undefined ? 60 : opts.maxRetryAfterSeconds;
  const sleep = opts.sleep || defaultSleep;

  async function send(url, route, requestOptions) {
    const ro = requestOptions || {};
    const headers = { accept: 'application/json', 'user-agent': userAgent };
    if (route.auth) headers.authorization = 'Bearer ' + opts.apiKey;
    if (ro.ifNoneMatch) headers['if-none-match'] = ro.ifNoneMatch;
    let response;
    try {
      response = await fetchImpl(url, { method: route.method, headers: headers, signal: ro.signal });
    } catch (err) {
      throw new BroadcastwellApiError({
        status: 0,
        code: 'network_error',
        detail: 'Could not reach the Broadcastwell API: ' + (err && err.message ? err.message : String(err)),
        url: url,
      });
    }
    return response;
  }

  async function toError(response, url) {
    const text = await response.text().catch(function () {
      return '';
    });
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (e) {
      body = text;
    }
    const problem = body && typeof body === 'object' ? body : {};
    return new BroadcastwellApiError({
      status: response.status,
      code: problem.code,
      detail: problem.detail || (typeof body === 'string' && body) || response.statusText,
      title: problem.title,
      type: problem.type,
      retryAfter: headerNumber(response.headers, 'retry-after'),
      url: url,
      body: body,
    });
  }

  async function request(name, params, requestOptions) {
    const route = resolveRoute(name);
    const p = Object.assign({}, params || {});
    if (route.pathParams.some(function (x) { return x.name === 'account'; }) && !p.account) {
      p.account = account;
    }
    const url = baseUrl + buildPath(route, p) + buildQuery(route, p);
    let response = await send(url, route, requestOptions);
    if (response.status === 429 && retryOn429) {
      const wait = headerNumber(response.headers, 'retry-after');
      const seconds = wait === null ? 1 : wait;
      if (seconds <= maxRetryAfter) {
        await sleep(seconds * 1000);
        response = await send(url, route, requestOptions);
      }
    }
    if (response.status === 304) {
      return { notModified: true, etag: headerValue(response.headers, 'etag') };
    }
    if (!response.ok) throw await toError(response, url);
    const body = await response.json();
    if (body && typeof body === 'object') {
      metaStore.set(body, {
        status: response.status,
        url: url,
        etag: headerValue(response.headers, 'etag'),
        rateLimit: {
          limit: headerNumber(response.headers, 'ratelimit-limit'),
          remaining: headerNumber(response.headers, 'ratelimit-remaining'),
          reset: headerNumber(response.headers, 'ratelimit-reset'),
        },
      });
    }
    return body;
  }

  async function* paginate(name, params, options) {
    const route = resolveRoute(name);
    if (!route.paged) throw new TypeError(route.name + ' does not page. Call it directly.');
    const o = options || {};
    const max = o.maxItems === undefined ? Infinity : o.maxItems;
    let count = 0;
    let cursor = params && params.cursor ? params.cursor : undefined;
    const seen = new Set();
    for (;;) {
      const page = await request(route.name, Object.assign({}, params || {}, { cursor: cursor }), {
        signal: o.signal,
      });
      const items = page && Array.isArray(page.data) ? page.data : [];
      for (let i = 0; i < items.length; i++) {
        if (count >= max) return;
        count++;
        yield items[i];
      }
      const next = page && page.pagination ? page.pagination.next_cursor : null;
      if (!next || seen.has(next) || items.length === 0) return;
      seen.add(next);
      cursor = next;
    }
  }

  const client = {
    account: account,
    baseUrl: baseUrl,
    request: request,
    paginate: paginate,
  };
  Object.keys(routes).forEach(function (name) {
    client[name] = function (params, requestOptions) {
      return request(name, params, requestOptions);
    };
  });
  return Object.freeze(client);
}

// ---------------------------------------------------------------------------
// Webhook signatures (WebCrypto: Node 18 and later, browsers, workers)
// ---------------------------------------------------------------------------

async function getSubtle() {
  if (typeof crypto !== 'undefined' && crypto && crypto.subtle) return crypto.subtle;
  // Node 18 without the global: fall back to the built in module.
  const mod = await import('node:crypto');
  return mod.webcrypto.subtle;
}

function toBytes(input) {
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input && input.buffer instanceof ArrayBuffer) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('rawBody must be a string, Uint8Array or ArrayBuffer');
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return out;
}

async function hmacHex(secret, timestamp, rawBody) {
  const subtle = await getSubtle();
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const prefix = new TextEncoder().encode(String(timestamp) + '.');
  const body = toBytes(rawBody);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix, 0);
  message.set(body, prefix.length);
  return toHex(await subtle.sign('HMAC', key, message));
}

function constantTimeEqual(a, b) {
  const x = String(a).toLowerCase();
  const y = String(b).toLowerCase();
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

function parseSignatureHeader(header) {
  if (!header || typeof header !== 'string') return null;
  let t = NaN;
  const v1 = [];
  header.split(',').forEach(function (part) {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') t = /^\d+$/.test(v) ? Number(v) : NaN;
    else if (k === 'v1' && /^[0-9a-fA-F]{64}$/.test(v)) v1.push(v);
  });
  if (!Number.isFinite(t) || v1.length === 0) return null;
  return { t: t, v1: v1 };
}

async function verifyWebhookSignature(secret, header, rawBody, options) {
  const o = options || {};
  const tolerance = o.toleranceSeconds === undefined ? SIGNATURE_TOLERANCE_SECONDS : o.toleranceSeconds;
  const now = o.now === undefined ? Math.floor(Date.now() / 1000) : o.now;
  if (!secret) return { valid: false, reason: 'missing_secret' };
  if (!header) return { valid: false, reason: 'missing_header' };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, reason: 'malformed_header' };
  if (Math.abs(now - parsed.t) > tolerance) {
    return { valid: false, reason: 'stale_timestamp', timestamp: parsed.t };
  }
  const expected = await hmacHex(secret, parsed.t, rawBody);
  let match = false;
  for (let i = 0; i < parsed.v1.length; i++) {
    if (constantTimeEqual(expected, parsed.v1[i])) match = true;
  }
  return match
    ? { valid: true, timestamp: parsed.t }
    : { valid: false, reason: 'signature_mismatch', timestamp: parsed.t };
}

async function signWebhookPayload(secret, rawBody, timestamp) {
  const t = timestamp === undefined ? Math.floor(Date.now() / 1000) : timestamp;
  return 't=' + t + ',v1=' + (await hmacHex(secret, t, rawBody));
}

export {
  API_VERSION,
  DEFAULT_BASE_URL,
  DEMO_KEY,
  SAMPLE_ACCOUNT,
  ENGINES,
  ENGINE_IDS,
  EVENT_TYPES,
  SIGNATURE_TOLERANCE_SECONDS,
  WEBHOOK_HEADERS,
  routes,
  buildPath,
  buildQuery,
  createClient,
  getResponseMeta,
  isNotModified,
  BroadcastwellApiError,
  verifyWebhookSignature,
  signWebhookPayload,
  parseSignatureHeader,
};
