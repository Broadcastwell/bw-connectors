#!/usr/bin/env node
// Generates the routes table (src/routes.mjs) and the TypeScript declarations
// (types.d.ts) from the Broadcastwell OpenAPI document. No dependencies.
//
//   node scripts/generate-types.mjs                 use the committed openapi.json
//   node scripts/generate-types.mjs --fetch         download the live document first
//   node scripts/generate-types.mjs --source <path or https URL>
//   node scripts/generate-types.mjs --check         fail if the generated files are stale
//
// The OpenAPI document is the single source of truth for routes, parameters and
// response shapes. Everything else in this repo reads the generated routes table.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, '..');
const LIVE_URL = 'https://app.broadcastwell.com/api/v1/openapi.json';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function loadDocument() {
  let source = option('--source');
  if (!source && flag('--fetch')) source = LIVE_URL;
  if (source && /^https?:\/\//.test(source)) {
    const res = await fetch(source, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Could not fetch ${source}: HTTP ${res.status}`);
    const text = await res.text();
    JSON.parse(text);
    await writeFile(join(pkgDir, 'openapi.json'), text, 'utf8');
    return JSON.parse(text);
  }
  const path = source || join(pkgDir, 'openapi.json');
  return JSON.parse(await readFile(path, 'utf8'));
}

const refName = (ref) => ref.split('/').pop();

function resolveParam(doc, p) {
  if (p.$ref) return doc.components.parameters[refName(p.$ref)];
  return p;
}

function tsType(schema, indent = '') {
  if (!schema) return 'unknown';
  if (schema.$ref) return refName(schema.$ref);
  if (schema.anyOf) return schema.anyOf.map((s) => tsType(s, indent)).join(' | ');
  if (schema.oneOf) return schema.oneOf.map((s) => tsType(s, indent)).join(' | ');
  if (schema.enum) {
    return schema.enum.map((v) => (v === null ? 'null' : JSON.stringify(v))).join(' | ');
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const parts = types.map((t) => {
    switch (t) {
      case 'string':
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'null':
        return 'null';
      case 'array':
        return schema.items ? `Array<${tsType(schema.items, indent)}>` : 'unknown[]';
      case 'object':
        return schema.properties ? objectType(schema, indent) : 'Record<string, unknown>';
      default:
        return 'unknown';
    }
  });
  return parts.join(' | ');
}

function propKey(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function objectBody(schema, indent) {
  const required = new Set(schema.required || []);
  const lines = [];
  for (const [name, prop] of Object.entries(schema.properties || {})) {
    if (prop.description) lines.push(`${indent}  /** ${prop.description} */`);
    lines.push(`${indent}  ${propKey(name)}${required.has(name) ? '' : '?'}: ${tsType(prop, indent + '  ')};`);
  }
  if (schema.additionalProperties !== false) {
    lines.push(`${indent}  /** Version 1 changes only by addition: extra fields may appear. */`);
    lines.push(`${indent}  [key: string]: unknown;`);
  }
  return lines.join('\n');
}

function objectType(schema, indent) {
  return `{\n${objectBody(schema, indent)}\n${indent}}`;
}

const pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function collectRoutes(doc) {
  const routes = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const params = [...(item.parameters || []), ...(op.parameters || [])].map((p) =>
        resolveParam(doc, p),
      );
      const pathParams = params.filter((p) => p.in === 'path');
      const queryParams = params.filter((p) => p.in === 'query');
      const ok = op.responses['200'];
      const schema = ok?.content?.['application/json']?.schema;
      const dataSchema = schema?.properties?.data;
      const paged = Boolean(schema?.properties?.pagination);
      const returns = paged ? 'page' : dataSchema?.type === 'array' ? 'array' : 'object';
      routes.push({
        name: op.operationId,
        method: method.toUpperCase(),
        path,
        summary: op.summary || '',
        description: op.description || '',
        tag: (op.tags || [])[0] || '',
        auth: !(Array.isArray(op.security) && op.security.length === 0),
        pathParams: pathParams.map((p) => ({
          name: p.name,
          type: p.schema?.type === 'integer' ? 'integer' : 'string',
          description: p.description || '',
          ...(p.schema?.pattern ? { pattern: p.schema.pattern } : {}),
          ...(p.schema?.minimum !== undefined ? { minimum: p.schema.minimum } : {}),
          ...(p.schema?.maximum !== undefined ? { maximum: p.schema.maximum } : {}),
          ...(p.schema?.maxLength !== undefined ? { maxLength: p.schema.maxLength } : {}),
        })),
        queryParams: queryParams.map((p) => {
          let s = p.schema || {};
          if (s.$ref) s = doc.components.schemas[refName(s.$ref)];
          return {
            name: p.name,
            type: s.type === 'integer' ? 'integer' : 'string',
            description: p.description || '',
            ...(s.enum ? { enum: s.enum } : {}),
            ...(s.minimum !== undefined ? { minimum: s.minimum } : {}),
            ...(s.maximum !== undefined ? { maximum: s.maximum } : {}),
            ...(s.maxLength !== undefined ? { maxLength: s.maxLength } : {}),
            ...(s.default !== undefined ? { default: s.default } : {}),
          };
        }),
        paged,
        returns,
        _schema: schema,
        _params: params,
      });
    }
  }
  return routes;
}

function routesModule(doc, routes) {
  const clean = routes.map(({ _schema, _params, ...r }) => r);
  const engineSchema = doc.components.schemas.EngineId;
  return `// GENERATED by scripts/generate-types.mjs from openapi.json (${doc.info.title} ${doc.info.version}).
// Do not edit by hand. Run \`npm run generate\` in packages/api after updating openapi.json.

/** API version this table was generated from. */
export const API_VERSION = ${JSON.stringify(doc.info.version)};

/** Default base URL, from the OpenAPI servers list. */
export const DEFAULT_BASE_URL = ${JSON.stringify(doc.servers[0].url)};

/** Engine ids in the order the API lists them. */
export const ENGINE_IDS = Object.freeze(${JSON.stringify(engineSchema.enum)});

/**
 * Every route, keyed by method name (the OpenAPI operationId).
 * Each entry: HTTP method, path template, path and query parameters,
 * whether it pages (pagination.next_cursor) and what \`data\` holds.
 */
export const routes = Object.freeze(${JSON.stringify(
    Object.fromEntries(clean.map((r) => [r.name, r])),
    null,
    2,
  )});
`;
}

function typesFile(doc, routes) {
  const out = [];
  out.push(`// GENERATED by scripts/generate-types.mjs from openapi.json (${doc.info.title} ${doc.info.version}).`);
  out.push('// Do not edit by hand. Run `npm run generate` in packages/api after updating openapi.json.');
  out.push('');
  out.push('// ---------- Component schemas ----------');
  out.push('');
  for (const [name, schema] of Object.entries(doc.components.schemas)) {
    if (schema.description) out.push(`/** ${schema.description} */`);
    if (schema.type === 'object' && schema.properties) {
      out.push(`export interface ${name} ${objectType(schema, '')}`);
    } else {
      out.push(`export type ${name} = ${tsType(schema)};`);
    }
    out.push('');
  }

  out.push('// ---------- Parameters and responses per route ----------');
  out.push('');
  out.push('/** Options accepted by every method. */');
  out.push('export interface RequestOptions {');
  out.push('  /** Send If-None-Match. A 304 resolves to a NotModified object instead of the body. */');
  out.push('  ifNoneMatch?: string;');
  out.push('  /** Abort the request. */');
  out.push('  signal?: AbortSignal;');
  out.push('}');
  out.push('');
  out.push('/** Returned instead of the body when If-None-Match matched (HTTP 304). */');
  out.push('export interface NotModified {');
  out.push('  notModified: true;');
  out.push('  etag: string | null;');
  out.push('}');
  out.push('');

  for (const r of routes) {
    const P = pascal(r.name);
    const lines = [];
    for (const p of r._params) {
      let s = p.schema || {};
      const optional = p.in === 'query' || (p.name === 'account' && p.in === 'path');
      const doc1 = p.name === 'account'
        ? `${p.description} Defaults to the client's account (me, or sample with the demo key).`
        : p.description;
      if (doc1) lines.push(`  /** ${doc1} */`);
      lines.push(`  ${propKey(p.name)}${optional ? '?' : ''}: ${tsType(s)};`);
    }
    out.push(`/** Parameters for ${r.name}: ${r.method} ${r.path} */`);
    out.push(lines.length ? `export interface ${P}Params {\n${lines.join('\n')}\n}` : `export type ${P}Params = Record<string, never>;`);
    out.push('');
    out.push(`/** Response body for ${r.name}. */`);
    out.push(`export interface ${P}Response ${objectType(r._schema, '')}`);
    out.push('');
  }

  const paged = routes.filter((r) => r.paged);
  out.push('/** Method names whose responses page with pagination.next_cursor. */');
  out.push(`export type PagedMethod = ${paged.map((r) => JSON.stringify(r.name)).join(' | ')};`);
  out.push('');
  out.push('/** The item type each paged method yields from paginate(). */');
  out.push('export interface PagedItem {');
  for (const r of paged) out.push(`  ${r.name}: ${pascal(r.name)}Response['data'][number];`);
  out.push('}');
  out.push('');
  out.push('/** Parameters per method name. */');
  out.push('export interface MethodParams {');
  for (const r of routes) out.push(`  ${r.name}: ${pascal(r.name)}Params;`);
  out.push('}');
  out.push('');

  out.push('// ---------- Client ----------');
  out.push('');
  out.push('export interface BroadcastwellClient {');
  for (const r of routes) {
    const P = pascal(r.name);
    const needsParams = r._params.some((p) => p.in === 'path' && p.name !== 'account');
    const q = needsParams ? '' : '?';
    const summary = [r.summary, r.description].filter(Boolean).join('. ').replace(/\.\./g, '.');
    out.push(`  /** ${summary} (${r.method} ${r.path}) */`);
    out.push(`  ${r.name}(params${q}: ${P}Params, options?: RequestOptions & { ifNoneMatch?: undefined }): Promise<${P}Response>;`);
    out.push(`  ${r.name}(params: ${P}Params, options: RequestOptions & { ifNoneMatch: string }): Promise<${P}Response | NotModified>;`);
  }
  out.push('  /** Follow pagination.next_cursor and yield every item. */');
  out.push('  paginate<K extends PagedMethod>(method: K, params?: MethodParams[K], options?: { signal?: AbortSignal; maxItems?: number }): AsyncGenerator<PagedItem[K], void, unknown>;');
  out.push('  /** Low level: call any route by name. */');
  out.push('  request<K extends keyof MethodParams>(method: K, params?: MethodParams[K], options?: RequestOptions): Promise<unknown>;');
  out.push('  /** The account used when a call leaves account out. */');
  out.push('  readonly account: string;');
  out.push('  readonly baseUrl: string;');
  out.push('}');
  out.push('');
  out.push(`export interface ClientOptions {
  /** An account key (bwp_ followed by 64 hex characters) or the public demo key. */
  apiKey: string;
  /** Defaults to ${doc.servers[0].url} */
  baseUrl?: string;
  /** A fetch implementation. Defaults to globalThis.fetch (Node 18 and later, browsers, workers). */
  fetch?: (input: string, init?: Record<string, unknown>) => Promise<unknown>;
  /** Sent as User-Agent where the runtime allows it. */
  userAgent?: string;
  /** Account used when a call leaves account out. Defaults to sample for the demo key and me otherwise. */
  account?: string;
  /** Retry once after a 429, waiting Retry-After seconds. Default true. */
  retryOn429?: boolean;
  /** Longest Retry-After the single retry will wait, in seconds. Default 60. */
  maxRetryAfterSeconds?: number;
  /** Replaceable sleep, used for the 429 retry. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ResponseMeta {
  status: number;
  url: string;
  etag: string | null;
  rateLimit: { limit: number | null; remaining: number | null; reset: number | null };
}

export declare function createClient(options: ClientOptions): BroadcastwellClient;

/** Status, ETag and RateLimit headers of the response a body came from. */
export declare function getResponseMeta(body: object): ResponseMeta | undefined;

/** True when a call made with ifNoneMatch came back 304 Not Modified. */
export declare function isNotModified(value: unknown): value is NotModified;

export declare class BroadcastwellApiError extends Error {
  readonly name: 'BroadcastwellApiError';
  /** HTTP status, or 0 when the request never got a response. */
  readonly status: number;
  /** Problem code: unauthorized, key_revoked, not_found, run_not_delivered, rate_limited and so on. */
  readonly code: string;
  readonly detail: string;
  readonly title: string;
  readonly type: string;
  /** Seconds from the Retry-After header, when present. */
  readonly retryAfter: number | null;
  readonly url: string;
  /** The parsed problem body, when there was one. */
  readonly body: unknown;
}

export interface RouteParam {
  name: string;
  type: 'string' | 'integer';
  description: string;
  enum?: Array<string | number>;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
}

export interface Route {
  name: keyof MethodParams;
  method: 'GET';
  path: string;
  summary: string;
  description: string;
  tag: string;
  auth: boolean;
  pathParams: RouteParam[];
  queryParams: RouteParam[];
  paged: boolean;
  returns: 'object' | 'array' | 'page';
}

/** Every route keyed by method name. The one place that knows the routes. */
export declare const routes: { readonly [K in keyof MethodParams]: Route };
export declare function buildPath(route: Route | keyof MethodParams, params?: Record<string, unknown>): string;
export declare function buildQuery(route: Route | keyof MethodParams, params?: Record<string, unknown>): string;

export declare const API_VERSION: string;
export declare const DEFAULT_BASE_URL: string;
/** The public demo key. It reads only the fictional Kalvenor sample account. */
export declare const DEMO_KEY: 'bwp_demo_kalvenor_sample';
/** Account id of the fictional Kalvenor sample. */
export declare const SAMPLE_ACCOUNT: 'sample';
export declare const ENGINE_IDS: readonly EngineId[];
/** Engine labels, exactly as the product names them. */
export declare const ENGINES: Readonly<Record<EngineId, string>>;
/** Webhook event types, including webhook.test sent by Send test event. */
export declare const EVENT_TYPES: readonly ['run.completed', 'alert.fired', 'fix.updated', 'proof.updated', 'webhook.test'];
export type EventType = (typeof EVENT_TYPES)[number];
/** Receivers reject a signature timestamp further than this from their clock (300). */
export declare const SIGNATURE_TOLERANCE_SECONDS: number;
export declare const WEBHOOK_HEADERS: Readonly<{
  signature: 'Broadcastwell-Signature';
  event: 'Broadcastwell-Event';
  eventId: 'Broadcastwell-Event-Id';
  delivery: 'Broadcastwell-Delivery';
}>;

export interface WebhookEnvelope extends Omit<Event, 'type'> {
  type: EventType;
}

export interface VerifyResult {
  valid: boolean;
  /** Why verification failed: missing_header, malformed_header, stale_timestamp, signature_mismatch, missing_secret. */
  reason?: string;
  /** The t value from the header, in unix seconds. */
  timestamp?: number;
}

/**
 * Verify a Broadcastwell-Signature header against the raw request body.
 * HMAC SHA-256 of "<t>.<raw body>" with the signing secret, compared in constant time.
 * Uses WebCrypto, so it runs in Node 18 and later, browsers and workers.
 */
export declare function verifyWebhookSignature(
  secret: string,
  header: string | null | undefined,
  rawBody: string | Uint8Array | ArrayBuffer,
  options?: { toleranceSeconds?: number; now?: number },
): Promise<VerifyResult>;

/** Build a Broadcastwell-Signature header value. Useful for testing a receiver. */
export declare function signWebhookPayload(
  secret: string,
  rawBody: string | Uint8Array | ArrayBuffer,
  timestamp?: number,
): Promise<string>;

export declare function parseSignatureHeader(header: string | null | undefined): { t: number; v1: string[] } | null;
`);
  return out.join('\n');
}

const doc = await loadDocument();
const routes = collectRoutes(doc);
const files = {
  [join(pkgDir, 'src', 'routes.mjs')]: routesModule(doc, routes),
  [join(pkgDir, 'types.d.ts')]: typesFile(doc, routes),
};

if (flag('--check')) {
  let stale = false;
  for (const [path, content] of Object.entries(files)) {
    const current = await readFile(path, 'utf8').catch(() => '');
    if (current !== content) {
      console.error(`Stale: ${path}. Run npm run generate.`);
      stale = true;
    }
  }
  process.exit(stale ? 1 : 0);
}

for (const [path, content] of Object.entries(files)) {
  await writeFile(path, content, 'utf8');
  console.log(`Wrote ${path}`);
}
console.log(`${routes.length} routes, ${Object.keys(doc.components.schemas).length} schemas.`);
