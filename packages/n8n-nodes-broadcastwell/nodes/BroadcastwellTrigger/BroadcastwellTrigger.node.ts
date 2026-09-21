import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IHookFunctions,
	INodeCredentialTestResult,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { EVENT_TYPES, WEBHOOK_HEADERS } from '../shared/broadcastwell.generated';
import { verifySignature } from './signature';

type RawBodyRequest = {
	rawBody?: Buffer;
	readRawBody?: () => Promise<void>;
};

/** Read the exact bytes Broadcastwell signed. */
export async function getRawBody(
	request: RawBodyRequest,
	parsedBody: IDataObject,
): Promise<{ raw: Buffer | string; source: 'rawBody' | 'readRawBody' | 'reserialised' }> {
	if (request.rawBody && request.rawBody.length > 0) return { raw: request.rawBody, source: 'rawBody' };
	if (typeof request.readRawBody === 'function') {
		await request.readRawBody();
		if (request.rawBody && request.rawBody.length > 0) {
			return { raw: request.rawBody, source: 'readRawBody' };
		}
	}
	// Last resort. Re-serialising matches only if the delivered JSON was compact with the
	// same key order. Any difference fails verification, which is the safe outcome.
	return { raw: JSON.stringify(parsedBody), source: 'reserialised' };
}

function headerValue(headers: IDataObject, name: string): string | undefined {
	const value = headers[name.toLowerCase()];
	if (Array.isArray(value)) return String(value[0]);
	return typeof value === 'string' ? value : undefined;
}

export class BroadcastwellTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Broadcastwell Trigger',
		name: 'broadcastwellTrigger',
		icon: { light: 'file:../../icons/broadcastwell.svg', dark: 'file:../../icons/broadcastwell.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when Broadcastwell sends a signed webhook: a run completed, an alert fired, a fix or a proof experiment was updated',
		defaults: {
			name: 'Broadcastwell Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'broadcastwellWebhookApi',
				required: true,
				testedBy: 'broadcastwellSigningSecretTest',
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Copy the Production URL above. In your Broadcastwell account open Webhooks, add a destination, paste the URL, choose the events and copy the signing secret into this node\'s credential. Then activate the workflow and use Send test event.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['run.completed', 'alert.fired', 'fix.updated', 'proof.updated', 'webhook.test'],
				options: [
					{
						name: 'Alert Fired',
						value: 'alert.fired',
						description: 'A movement between consecutive comparable scheduled runs where the intervals separate',
					},
					{
						name: 'Fix Updated',
						value: 'fix.updated',
					},
					{
						name: 'Proof Updated',
						value: 'proof.updated',
					},
					{
						name: 'Run Completed',
						value: 'run.completed',
					},
					{
						name: 'Test Event',
						value: 'webhook.test',
						description: 'Sent by Send test event in your Broadcastwell account',
					},
				],
				description:
					'Events that start the workflow. Other signed events are acknowledged with 200 and ignored.',
			},
		],
	};

	methods = {
		credentialTest: {
			async broadcastwellSigningSecretTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const secret = String(credential.data?.signingSecret ?? '');
				if (secret.trim() === '') {
					return { status: 'Error', message: 'Paste the signing secret from your Broadcastwell account' };
				}
				if (secret !== secret.trim()) {
					return { status: 'Error', message: 'The signing secret has spaces at the start or end' };
				}
				return {
					status: 'OK',
					message:
						'Signing secret saved. Use Send test event in your Broadcastwell account to check it end to end.',
				};
			},
		},
	};

	// Destinations are added by the account owner in the Broadcastwell account, not
	// through the API, so there is nothing to register or remove from here.
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject() as unknown as RawBodyRequest;
		const response = this.getResponseObject();
		const headers = this.getHeaderData() as IDataObject;
		const body = this.getBodyData();

		const credentials = await this.getCredentials('broadcastwellWebhookApi');
		const secret = String(credentials.signingSecret ?? '');
		const { raw } = await getRawBody(request, body);
		const check = verifySignature(
			secret,
			headerValue(headers, WEBHOOK_HEADERS.signature),
			raw,
			Math.floor(Date.now() / 1000),
		);

		if (!check.valid) {
			response.status(401).json({ error: 'invalid_signature', reason: check.reason });
			return { noWebhookResponse: true };
		}

		const events = this.getNodeParameter('events', []) as string[];
		const type = typeof body.type === 'string' ? body.type : '';
		if (!EVENT_TYPES.includes(type) || !events.includes(type)) {
			return { webhookResponse: { received: true, ignored: true, type } };
		}

		return {
			workflowData: [
				this.helpers.returnJsonArray([
					{
						...body,
						headers: {
							event: headerValue(headers, WEBHOOK_HEADERS.event) ?? null,
							event_id: headerValue(headers, WEBHOOK_HEADERS.eventId) ?? null,
							delivery: headerValue(headers, WEBHOOK_HEADERS.delivery) ?? null,
							signature_timestamp: check.timestamp ?? null,
						},
					},
				]),
			],
		};
	}
}
