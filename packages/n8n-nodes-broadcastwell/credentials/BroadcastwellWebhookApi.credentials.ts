import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class BroadcastwellWebhookApi implements ICredentialType {
	name = 'broadcastwellWebhookApi';

	displayName = 'Broadcastwell Webhook Signing Secret API';

	icon: Icon = {
		light: 'file:../icons/broadcastwell.svg',
		dark: 'file:../icons/broadcastwell.dark.svg',
	};

	documentationUrl =
		'https://github.com/Broadcastwell/bw-connectors/tree/main/packages/n8n-nodes-broadcastwell#trigger-setup';

	properties: INodeProperties[] = [
		{
			displayName: 'Signing Secret',
			name: 'signingSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'The signing secret of your webhook destination. Find it in your Broadcastwell account under Webhooks, next to the destination you added for this workflow.',
		},
	];
}
