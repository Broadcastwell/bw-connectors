import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

import {
	DEFAULT_BASE_URL,
	DEMO_KEY,
	ROUTES,
	SAMPLE_ACCOUNT,
	type Route,
	type RouteName,
} from './broadcastwell.generated';

/** The single retry after a 429 waits at most this long. */
export const MAX_RETRY_AFTER_SECONDS = 60;

/** Largest page the API serves. */
export const MAX_PAGE_SIZE = 100;

/**
 * The account to read. "me" with the public demo key becomes "sample", because the
 * demo key can only read the fictional Kalvenor sample account.
 */
export function resolveAccount(account: unknown, apiKey: unknown): string {
	const value = typeof account === 'string' && account.trim() !== '' ? account.trim() : 'me';
	return value === 'me' && apiKey === DEMO_KEY ? SAMPLE_ACCOUNT : value;
}

/** Fill a path template such as /accounts/{account}/runs/{run}. */
export function buildPath(route: Route, params: IDataObject): string {
	return route.path.replace(/\{([A-Za-z_]+)\}/g, (_match, name: string) => {
		const value = params[name];
		if (value === undefined || value === null || value === '') {
			throw new Error(`The ${name} parameter is required for this operation`);
		}
		return encodeURIComponent(String(value));
	});
}

/** Keep only the query parameters the route declares, dropping empty values. */
export function buildQuery(route: Route, params: IDataObject): IDataObject {
	const qs: IDataObject = {};
	for (const name of route.queryParams) {
		const value = params[name];
		if (value === undefined || value === null || value === '') continue;
		qs[name] = value;
	}
	return qs;
}

function header(response: IN8nHttpFullResponse, name: string): string | undefined {
	const headers = (response.headers ?? {}) as IDataObject;
	const value = headers[name] ?? headers[name.toLowerCase()];
	if (Array.isArray(value)) return String(value[0]);
	return value === undefined || value === null ? undefined : String(value);
}

function parseBody(body: unknown): IDataObject {
	if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body as IDataObject;
	const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
	try {
		return JSON.parse(text) as IDataObject;
	} catch {
		return { detail: text };
	}
}

/** One request to a Broadcastwell route, with one retry after a 429. */
export async function broadcastwellApiRequest(
	this: IExecuteFunctions,
	routeName: RouteName,
	params: IDataObject,
	itemIndex = 0,
): Promise<IDataObject> {
	const route = ROUTES[routeName];
	const credentials = await this.getCredentials('broadcastwellApi', itemIndex);
	const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const resolved: IDataObject = { ...params };
	if (route.pathParams.includes('account')) {
		resolved.account = resolveAccount(params.account, credentials.apiKey);
	}

	const options: IHttpRequestOptions = {
		method: 'GET',
		url: baseUrl + buildPath(route, resolved),
		qs: buildQuery(route, resolved),
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};

	let response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'broadcastwellApi',
		options,
	)) as IN8nHttpFullResponse;

	if (response.statusCode === 429) {
		const retryAfter = Number(header(response, 'retry-after') ?? '1');
		if (Number.isFinite(retryAfter) && retryAfter <= MAX_RETRY_AFTER_SECONDS) {
			await sleep(Math.max(0, retryAfter) * 1000);
			response = (await this.helpers.httpRequestWithAuthentication.call(
				this,
				'broadcastwellApi',
				options,
			)) as IN8nHttpFullResponse;
		}
	}

	if (response.statusCode >= 400) {
		const problem = parseBody(response.body);
		const code = typeof problem.code === 'string' ? problem.code : `http_${response.statusCode}`;
		const detail =
			typeof problem.detail === 'string' && problem.detail !== ''
				? problem.detail
				: 'The Broadcastwell API returned an error';
		const retryAfter = header(response, 'retry-after');
		let description = detail;
		if (retryAfter) description += ` Retry after ${retryAfter} seconds.`;
		if (response.statusCode === 404 && credentials.apiKey === DEMO_KEY) {
			description += ' The demo key reads only the account sample, the fictional Kalvenor sample data.';
		}
		throw new NodeApiError(this.getNode(), { ...problem, code } as JsonObject, {
			message: `Broadcastwell API ${response.statusCode} ${code}`,
			description,
			httpCode: String(response.statusCode),
			itemIndex,
		});
	}

	return parseBody(response.body);
}

/**
 * Follow pagination.next_cursor and collect items. With a limit, stops once it has
 * that many and asks for no more than it needs.
 */
export async function broadcastwellApiRequestAllItems(
	this: IExecuteFunctions,
	routeName: RouteName,
	params: IDataObject,
	itemIndex = 0,
	limit?: number,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	const seen = new Set<string>();
	let cursor: string | undefined;
	for (;;) {
		const remaining = limit === undefined ? MAX_PAGE_SIZE : limit - items.length;
		const page = await broadcastwellApiRequest.call(
			this,
			routeName,
			{ ...params, limit: Math.min(MAX_PAGE_SIZE, remaining), cursor },
			itemIndex,
		);
		const data = Array.isArray(page.data) ? (page.data as IDataObject[]) : [];
		items.push(...data);
		const pagination = (page.pagination ?? {}) as IDataObject;
		const next = typeof pagination.next_cursor === 'string' ? pagination.next_cursor : '';
		if (!next || seen.has(next) || data.length === 0) break;
		if (limit !== undefined && items.length >= limit) break;
		seen.add(next);
		cursor = next;
	}
	return limit === undefined ? items : items.slice(0, limit);
}
