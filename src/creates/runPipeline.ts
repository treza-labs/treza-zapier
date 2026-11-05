import {
	defineCreate,
	defineInputFields,
	type Bundle,
	type CreatePerform,
	type CreatePerformResume,
	type ZObject,
} from 'zapier-platform-core';

import { PIPELINE, RENDER_OUTPUT_FIELDS, RENDER_SAMPLE, maxCost } from '../fields.js';
import { awaitRender, callTool, finishedResult, requestTool, startQuoted, toLibraryUrl, type Data } from '../treza.js';
import { renderExtra } from './shared.js';

const INPUT_PREFIX = 'input__';

/** The pipeline's input steps: text, JSON (webhook trigger) or a file. */
async function entryNodes(z: ZObject, pipelineId: string): Promise<Data[]> {
	const pipeline = await callTool(z, 'get_pipeline', { pipelineId });
	return (pipeline.entryNodes ?? []) as Data[];
}

/** One field per input step of the picked pipeline. */
const pipelineInputs = async (z: ZObject, bundle: Bundle) => {
	const pipelineId = bundle.inputData.pipelineId;
	if (!pipelineId) return [];
	return (await entryNodes(z, String(pipelineId))).map((node) => ({
		key: `${INPUT_PREFIX}${node.id}`,
		label: String(node.label || node.id),
		required: false,
		...(node.type === 'file'
			? { type: 'file' as const, helpText: 'A file for this step. It is uploaded to your Treza library first.' }
			: node.type === 'webhook-trigger'
				? { type: 'text' as const, helpText: 'JSON for this step, e.g. {"title": "Spring sale"}.' }
				: { type: 'text' as const }),
	}));
};

const inputFields = defineInputFields([
	{ ...PIPELINE, altersDynamicFields: true },
	pipelineInputs,
	maxCost('5'),
]);

const perform = (async (z, bundle) => {
	const startedAt = Date.now();
	const data = bundle.inputData as Data;
	const pipelineId = String(data.pipelineId);
	const inputs: Data = {};
	for (const node of await entryNodes(z, pipelineId)) {
		const value = data[`${INPUT_PREFIX}${node.id}`];
		if (value === undefined || value === null || value === '') continue;
		if (node.type === 'file') {
			inputs[node.id] = await toLibraryUrl(z, String(value));
		} else if (node.type === 'webhook-trigger' && typeof value === 'string') {
			try {
				inputs[node.id] = JSON.parse(value);
			} catch {
				throw new z.errors.Error(`${String(node.label || node.id)} must be JSON, e.g. {"title": "Spring sale"}.`, 'InvalidInput', 400);
			}
		} else {
			inputs[node.id] = value;
		}
	}
	const maxCostUsd = Number(data.maxCostUsd);
	const started = await startQuoted(z, maxCostUsd, () => requestTool(z, 'estimate_run_cost', { pipelineId }), Object.keys(inputs).length ? inputs : undefined);
	return awaitRender(z, bundle, { ...started, extra: { estimatedChargeUsd: started.quoted.estimatedChargeUsd } }, undefined, startedAt);
}) satisfies CreatePerform<typeof inputFields>;

const performResume = (async (z, bundle) =>
	finishedResult(z, bundle.cleanedRequest as Data, renderExtra(bundle.outputData as Data))) satisfies CreatePerformResume<typeof inputFields>;

export default defineCreate({
	key: 'run_pipeline',
	noun: 'Run',
	display: {
		label: 'Run Pipeline',
		description: 'Runs one of your pipelines with new inputs, with a price cap.',
	},
	operation: {
		inputFields,
		perform,
		performResume,
		sample: { ...RENDER_SAMPLE, outputs: { final_cut: 'https://media.trezalabs.com/api/media/generated/video/7c1e.mp4' }, url: 'https://media.trezalabs.com/api/media/generated/video/7c1e.mp4' },
		outputFields: RENDER_OUTPUT_FIELDS,
	},
});
