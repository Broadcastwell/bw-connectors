import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BroadcastwellApi implements ICredentialType {
	name = 'broadcastwellApi';

	displayName = 'Broadcastwell API';

	icon: Icon = {
		light: 'file:../icons/broadcastwell.svg',
		dark: 'file:../icons/broadcastwell.dark.svg',
	};

	documentationUrl =
		'https://github.com/Broadcastwell/bw-connectors/tree/main/packages/n8n-nodes-broadcastwell#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'An account key from your Broadcastwell account (bwp_ followed by 64 hex characters). To try the node, use the public demo key bwp_demo_kalvenor_sample, which reads only the fictional Kalvenor sample account.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://app.broadcastwell.com/api/v1',
			description: 'Leave as is unless Broadcastwell has given you another address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/me',
			method: 'GET',
		},
	};
}
