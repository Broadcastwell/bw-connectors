// A small stand-in for n8n's IExecuteFunctions and IWebhookFunctions, enough to run
// the compiled nodes outside n8n. The HTTP helper can be a fake or a real fetch.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { NodeApiError, NodeOperationError } = require('n8n-workflow');

export { NodeApiError, NodeOperationError };
export const nodeModule = require('../dist/nodes/Broadcastwell/Broadcastwell.node.js');
export const { Broadcastwell } = nodeModule;
export const { BroadcastwellTrigger } = require('../dist/nodes/BroadcastwellTrigger/BroadcastwellTrigger.node.js');
export const { BroadcastwellApi } = require('../dist/credentials/BroadcastwellApi.credentials.js');
export const { BroadcastwellWebhookApi } = require('../dist/credentials/BroadcastwellWebhookApi.credentials.js');
export const transport = require('../dist/nodes/shared/transport.js');
export const generated = require('../dist/nodes/shared/broadcastwell.generated.js');
export const signature = require('../dist/nodes/BroadcastwellTrigger/signature.js');

const NODE = { id: 'n1', name: 'Broadcastwell', type: 'n8n-nodes-broadcastwell.broadcastwell', typeVersion: 1, position: [0, 0], parameters: {} };

/**
 * Build an IExecuteFunctions for one or more input items.
 * params: node parameters (same for every item) or a function (name, itemIndex) => value.
 * http: async (options) => ({ statusCode, headers, body }) receiving the options the
 *       node passed to httpRequestWithAuthentication, plus the credential applied.
 */
export function executeContext({ params, credentials, http, items = [{ json: {} }], continueOnFail = false }) {
  const calls = [];
  const get = typeof params === 'function' ? params : (name) => params[name];
  const ctx = {
    calls,
    getInputData: () => items,
    getNode: () => NODE,
    continueOnFail: () => continueOnFail,
    getNodeParameter(name, itemIndex, fallback) {
      const value = get(name, itemIndex);
      if (value === undefined) {
        if (arguments.length >= 3) return fallback;
        throw new Error(`Missing parameter ${name}`);
      }
      return value;
    },
    async getCredentials(type) {
      if (type !== 'broadcastwellApi') throw new Error(`Unexpected credential ${type}`);
      return credentials;
    },
    helpers: {
      async httpRequestWithAuthentication(credentialType, options) {
        if (credentialType !== 'broadcastwellApi') throw new Error('wrong credential type');
        // Apply the credential's generic authenticate, as n8n does.
        const headers = { ...(options.headers || {}), Authorization: `Bearer ${credentials.apiKey}` };
        const call = { ...options, headers };
        calls.push(call);
        return http(call);
      },
      returnJsonArray(data) {
        return (Array.isArray(data) ? data : [data]).map((json) => ({ json }));
      },
      constructExecutionMetaData(inputData, { itemData }) {
        return inputData.map((d) => ({ ...d, pairedItem: itemData }));
      },
    },
  };
  return ctx;
}

/** A real HTTP helper over fetch, for running the node against the live API. */
export async function fetchHttp(options) {
  const url = new URL(options.url);
  for (const [k, v] of Object.entries(options.qs || {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, { method: options.method, headers: options.headers });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep text
  }
  return { statusCode: res.status, headers: Object.fromEntries(res.headers.entries()), body, url: url.toString() };
}

/** Build an IWebhookFunctions for the trigger. */
export function webhookContext({ secret, headers, rawBody, parsedBody, events, rawMode = 'rawBody' }) {
  const response = { statusCode: 200, sent: null };
  const request = {};
  if (rawMode === 'rawBody') request.rawBody = Buffer.from(rawBody);
  if (rawMode === 'readRawBody') {
    request.readRawBody = async () => {
      request.rawBody = Buffer.from(rawBody);
    };
  }
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const ctx = {
    response,
    getRequestObject: () => request,
    getResponseObject: () => ({
      status(code) {
        response.statusCode = code;
        return this;
      },
      json(body) {
        response.sent = body;
        return this;
      },
    }),
    getHeaderData: () => lower,
    getBodyData: () => parsedBody ?? JSON.parse(rawBody),
    getNode: () => ({ ...NODE, name: 'Broadcastwell Trigger' }),
    getNodeParameter: (name, fallback) => (name === 'events' ? events : fallback),
    async getCredentials(type) {
      if (type !== 'broadcastwellWebhookApi') throw new Error(`Unexpected credential ${type}`);
      return { signingSecret: secret };
    },
    helpers: {
      returnJsonArray(data) {
        return (Array.isArray(data) ? data : [data]).map((json) => ({ json }));
      },
    },
  };
  return ctx;
}

export function json(body, statusCode = 200, headers = {}) {
  return { statusCode, headers: { 'content-type': 'application/json', ...headers }, body };
}
