import { defineInputFields, defineSearch, type SearchPerform } from 'zapier-platform-core';

import { PIPELINE, RENDER_OUTPUT_FIELDS, RENDER_SAMPLE } from '../fields.js';
import { requestTool, refusalError, runItem } from '../treza.js';

const inputFields = defineInputFields([
	PIPELINE,
	{
		key: 'runId',
		label: 'Run',
		required: true,
		dynamic: 'run_list.id.name',
		helpText: 'A recent run of the pipeline, or the Run ID from an earlier Treza step.',
	},
]);

const perform = (async (z, bundle) => {
	const pipelineId = String(bundle.inputData.pipelineId);
	const result = await requestTool(z, 'get_run', { pipelineId, runId: String(bundle.inputData.runId) });
	if (!result.ok) {
		if (result.status === 404) return [];
		throw refusalError(z, result);
	}
	return [runItem({ ...result.data, pipelineId })];
}) satisfies SearchPerform<typeof inputFields>;

export default defineSearch({
	key: 'find_run',
	noun: 'Run',
	display: {
		label: 'Find Run',
		description: 'Finds a run of a pipeline, with its status and finished files.',
	},
	operation: {
		inputFields,
		perform,
		sample: RENDER_SAMPLE,
		outputFields: RENDER_OUTPUT_FIELDS,
	},
});
