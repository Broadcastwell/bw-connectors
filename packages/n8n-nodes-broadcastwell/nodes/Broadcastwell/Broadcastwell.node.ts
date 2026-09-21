import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { ROUTES, type RouteName } from '../shared/broadcastwell.generated';
import { broadcastwellApiRequest, broadcastwellApiRequestAllItems } from '../shared/transport';

/** resource:operation to the route it calls. The routes come from @broadcastwell/api. */
export const OPERATION_ROUTES: Record<string, RouteName> = {
	'account:get': 'getAccount',
	'account:getKey': 'getMe',
	'alert:getMany': 'listAlerts',
	'displacement:getMany': 'listDisplacement',
	'fix:getMany': 'listFixes',
	'fix:getManyForRun': 'listRunFixes',
	'history:get': 'getHistory',
	'method:get': 'getMethod',
	'proof:get': 'getProof',
	'proof:getMany': 'listProof',
	'question:get': 'getQuestion',
	'question:getMany': 'listQuestions',
	'receipt:get': 'getReceipt',
	'receipt:getMany': 'listReceipts',
	'run:compare': 'compareRuns',
	'run:get': 'getRun',
	'run:getMany': 'listRuns',
	'run:getSummary': 'getRunSummary',
	'source:getMany': 'listSources',
};

const RUN_SCOPED = {
	displacement: ['getMany'],
	fix: ['getManyForRun'],
	question: ['get', 'getMany'],
	receipt: ['get', 'getMany'],
	run: ['compare', 'get', 'getSummary'],
	source: ['getMany'],
};

const PAGED = {
	alert: ['getMany'],
	displacement: ['getMany'],
	question: ['getMany'],
	receipt: ['getMany'],
	run: ['getMany'],
	source: ['getMany'],
};

export class Broadcastwell implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Broadcastwell',
		name: 'broadcastwell',
		icon: { light: 'file:../../icons/broadcastwell.svg', dark: 'file:../../icons/broadcastwell.dark.svg' },
		group: ['input'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Read Broadcastwell runs, receipts, sources, fixes, history, alerts and proof: whether ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode name your company',
		defaults: {
			name: 'Broadcastwell',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'broadcastwellApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Alert', value: 'alert' },
					{ name: 'Displacement', value: 'displacement', description: 'Who was named instead, per question' },
					{ name: 'Fix', value: 'fix' },
					{ name: 'History', value: 'history' },
					{ name: 'Method', value: 'method' },
					{ name: 'Proof', value: 'proof' },
					{ name: 'Question', value: 'question' },
					{ name: 'Receipt', value: 'receipt' },
					{ name: 'Run', value: 'run' },
					{ name: 'Source', value: 'source' },
				],
				default: 'run',
			},

			// ----------------------------------------------------------------
			// Operations
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get one account',
						action: 'Get an account',
					},
					{
						name: 'Get Key Info',
						value: 'getKey',
						description: 'Who the API key belongs to and which accounts it reads',
						action: 'Get key info',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['alert'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description:
							'Movements between consecutive comparable scheduled runs where the two intervals separate',
						action: 'Get many alerts',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['displacement'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description:
							'Per question, who was named in answers that did not name the company, including competitors checked and not found',
						action: 'Get many displacement rows',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['fix'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Every fix on the account',
						action: 'Get many fixes',
					},
					{
						name: 'Get Many for Run',
						value: 'getManyForRun',
						description: 'The fixes that came from one run',
						action: 'Get many fixes for a run',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['history'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description:
							'One point per scheduled run with its interval, for the account, each engine and each question type',
						action: 'Get history',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['method'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description:
							'The method version, every definition, the five engines, the proof rules and what the numbers do not prove',
						action: 'Get the method',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['proof'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get one controlled lift experiment',
						action: 'Get a proof experiment',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description:
							'Controlled lift experiments with the four counts, intervals, the lift in points and the fixed verdict',
						action: 'Get many proof experiments',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['question'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Counts per engine, competitors named and who was named instead',
						action: 'Get a question',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Every question in a run with its counts and named rate',
						action: 'Get many questions',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['receipt'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'One observed answer with its verdict and every cited address',
						action: 'Get a receipt',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Observed answers with their verdict and every cited address',
						action: 'Get many receipts',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['run'] } },
				options: [
					{
						name: 'Compare',
						value: 'compare',
						description:
							'Named rates on the questions and engines both runs measured. A change is called only where the intervals separate.',
						action: 'Compare two runs',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get one run with its passes',
						action: 'Get a run',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Every measurement the account holds, newest first',
						action: 'Get many runs',
					},
					{
						name: 'Get Summary',
						value: 'getSummary',
						description:
							'Named and own domain cited rates on scheduled passes, overall, per engine and per question type',
						action: 'Get a run summary',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['source'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Every page cited in scheduled answers, with times cited, engines and questions',
						action: 'Get many sources',
					},
				],
				default: 'getMany',
			},

			// ----------------------------------------------------------------
			// Fields
			// ----------------------------------------------------------------
			{
				displayName: 'Account',
				name: 'account',
				type: 'string',
				default: 'me',
				required: true,
				displayOptions: {
					hide: {
						resource: ['method'],
						operation: ['getKey'],
					},
				},
				description:
					'Use me for the account that owns the API key. The public demo key reads only sample, the fictional Kalvenor sample data. With the demo key, me is read as sample automatically.',
			},
			{
				displayName: 'Run ID',
				name: 'run',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'baseline-kalvenor-v11',
				displayOptions: {
					show: {
						resource: ['displacement'],
						operation: ['getMany'],
					},
				},
				description:
					'A run ID from Run, Get Many. In the fictional Kalvenor sample, try baseline-kalvenor-v11.',
			},
			...(['fix', 'question', 'receipt', 'run', 'source'] as const).map((resource) => ({
				displayName: 'Run ID',
				name: 'run',
				type: 'string' as const,
				default: '',
				required: true,
				placeholder: 'baseline-kalvenor-v11',
				displayOptions: {
					show: {
						resource: [resource],
						operation: RUN_SCOPED[resource],
					},
				},
				description:
					'A run ID from Run, Get Many. In the fictional Kalvenor sample, try baseline-kalvenor-v11.',
			})),
			{
				displayName: 'Other Run ID',
				name: 'other',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'kalvenor-monitor',
				displayOptions: { show: { resource: ['run'], operation: ['compare'] } },
				description: 'The second run to compare against',
			},
			{
				displayName: 'Question ID',
				name: 'question',
				type: 'number',
				default: 1,
				required: true,
				typeOptions: { minValue: 1, maxValue: 35 },
				displayOptions: { show: { resource: ['question'], operation: ['get'] } },
				description: 'The question number within the run, 1 to 35',
			},
			{
				displayName: 'Receipt ID',
				name: 'receipt',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['receipt'], operation: ['get'] } },
				description: 'A receipt_id from Receipt, Get Many',
			},
			{
				displayName: 'Experiment ID',
				name: 'experiment',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'sample-proof-01',
				displayOptions: { show: { resource: ['proof'], operation: ['get'] } },
				description: 'An experiment_id from Proof, Get Many',
			},
			{
				displayName: 'Scope',
				name: 'scope',
				type: 'options',
				default: 'all',
				displayOptions: { show: { resource: ['history'], operation: ['get'] } },
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'All Scopes', value: 'all' },
					{ name: 'Engine', value: 'engine' },
					{ name: 'Question Type', value: 'question_type' },
				],
				description: 'Which series to return',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['receipt'], operation: ['getMany'] } },
				options: [
					{
						displayName: 'Engine',
						name: 'engine',
						type: 'options',
						default: 'chatgpt',
						options: [
							{ name: 'ChatGPT', value: 'chatgpt' },
							{ name: 'Claude', value: 'claude' },
							{ name: 'Google AI Mode', value: 'google_ai_mode' },
							{ name: 'Google AI Overviews', value: 'google_aio' },
							{ name: 'Perplexity', value: 'perplexity' },
						],
					},
					{
						displayName: 'Pass ID',
						name: 'pass_id',
						type: 'string',
						default: '',
						placeholder: 'run-1',
						description: 'A pass_id from the run, such as run-1 or 2026-08',
					},
					{
						displayName: 'Question ID',
						name: 'question_id',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 1, maxValue: 35 },
					},
					{
						displayName: 'Verdict',
						name: 'verdict',
						type: 'options',
						default: 'named',
						options: [
							{ name: 'Excluded', value: 'excluded' },
							{ name: 'Named', value: 'named' },
							{ name: 'Not Named', value: 'not_named' },
						],
					},
				],
			},
			...(Object.keys(PAGED) as Array<keyof typeof PAGED>).flatMap((resource) => [
				{
					displayName: 'Return All',
					name: 'returnAll',
					type: 'boolean' as const,
					default: false,
					displayOptions: { show: { resource: [resource], operation: PAGED[resource] } },
					description: 'Whether to return all results or only up to a given limit',
				},
				{
					displayName: 'Limit',
					name: 'limit',
					type: 'number' as const,
					default: 50,
					typeOptions: { minValue: 1 },
					displayOptions: {
						show: { resource: [resource], operation: PAGED[resource], returnAll: [false] },
					},
					description: 'Max number of results to return',
				},
			]),
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			let failure: Error | undefined;
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const routeName = OPERATION_ROUTES[`${resource}:${operation}`];
				if (!routeName) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation ${operation} is not supported for ${resource}`,
						{ itemIndex },
					);
				}
				const route = ROUTES[routeName];

				const params: IDataObject = {};
				for (const name of route.pathParams) {
					params[name] = this.getNodeParameter(name, itemIndex);
				}
				if (routeName === 'getHistory') {
					const scope = this.getNodeParameter('scope', itemIndex, 'all') as string;
					if (scope !== 'all') params.scope = scope;
				}
				if (routeName === 'listReceipts') {
					Object.assign(params, this.getNodeParameter('filters', itemIndex, {}) as IDataObject);
				}

				let results: IDataObject[];
				if (route.paged) {
					const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
					const limit = returnAll
						? undefined
						: (this.getNodeParameter('limit', itemIndex, 50) as number);
					results = await broadcastwellApiRequestAllItems.call(
						this,
						routeName,
						params,
						itemIndex,
						limit,
					);
				} else {
					const body = await broadcastwellApiRequest.call(this, routeName, params, itemIndex);
					const data = body.data;
					if (Array.isArray(data)) results = data as IDataObject[];
					else if (data && typeof data === 'object') results = [data as IDataObject];
					else results = [body];
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(results),
					{ itemData: { item: itemIndex } },
				);
				returnData.push(...executionData);
			} catch (error) {
				failure = error as Error;
			}
			if (failure === undefined) continue;
			if (this.continueOnFail()) {
				returnData.push({ json: { error: failure.message }, pairedItem: { item: itemIndex } });
				continue;
			}
			// API errors are already NodeApiError with the HTTP status and problem detail.
			if (failure instanceof NodeApiError || failure instanceof NodeOperationError) throw failure;
			throw new NodeOperationError(this.getNode(), failure, { itemIndex });
		}

		return [returnData];
	}
}
