import { defineInputFields, defineTrigger, type PollingTriggerPerform } from 'zapier-platform-core';

import { PIPELINE, RUN_OUTPUT_FIELDS, RUN_SAMPLE } from '../fields.js';
import { callTool, runItem, type Data } from '../treza.js';

const inputFields = defineInputFields([
	PIPELINE,
	{
		key: 'statuses',
		label: 'Run endings',
		list: true,
		required: false,
		choices: [
			{ value: 'success', label: 'Succeeded', sample: 'success' },
			{ value: 'error', label: 'Failed', sample: 'error' },
			{ value: 'partial', label: 'Partly finished', sample: 'partial' },
			{ value: 'cancelled', label: 'Cancelled', sample: 'cancelled' },
		],
		helpText: 'Which endings start the Zap. Leave it empty to act only on runs that succeeded.',
	},
]);

/** How many new runs get their full details (outputs) per poll, inside Zapier's 30 seconds. */
const DETAILED = 10;

const perform = (async (z, bundle) => {
	const pipelineId = bundle.inputData.pipelineId;
	const wanted = new Set<string>(
		(Array.isArray(bundle.inputData.statuses) ? bundle.inputData.statuses : [bundle.inputData.statuses]).filter(Boolean).map(String),
	);
	if (wanted.size === 0) wanted.add('success');
	const { runs } = await callTool(z, 'list_runs', { pipelineId, limit: 25 });
	const finished = ((runs ?? []) as Data[]).filter((r) => wanted.has(String(r.status))).slice(0, DETAILED);
	const detailed = await Promise.all(finished.map((r) => callTool(z, 'get_run', { pipelineId, runId: r.runId })));
	return detailed.filter((run) => wanted.has(String(run.status))).map((run) => runItem({ ...run, pipelineId }) as Data & { id: string });
}) satisfies PollingTriggerPerform<typeof inputFields>;

export default defineTrigger({
	key: 'run_finished',
	noun: 'Run',
	display: {
		label: 'Run Finished',
		description: 'Triggers when a run of a pipeline finishes.',
	},
	operation: {
		type: 'polling',
		inputFields,
		perform,
		sample: RUN_SAMPLE,
		outputFields: RUN_OUTPUT_FIELDS,
	},
});
