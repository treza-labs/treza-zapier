import { defineInputFields, defineTrigger, type PollingTriggerPerform } from 'zapier-platform-core';

import { baseUrl, callTool, type Data } from '../treza.js';

/** Hidden triggers that fill dropdowns. */

const noInputs = defineInputFields([]);

const listPipelines = (async (z) => {
	const { pipelines } = await callTool(z, 'list_pipelines');
	return ((pipelines ?? []) as Data[]).map((p) => ({ id: p.id, name: p.name || p.id }));
}) satisfies PollingTriggerPerform<typeof noInputs>;

export const pipelineList = defineTrigger({
	key: 'pipeline_list',
	noun: 'Pipeline',
	display: { label: 'List Pipelines', description: 'Lists your pipelines for dropdowns.', hidden: true },
	operation: {
		type: 'polling',
		inputFields: noInputs,
		perform: listPipelines,
		sample: { id: 'pipeline_1793481891925_m4p901yqr', name: 'Product ad, vertical' },
	},
});

const usd = (n: unknown) => (typeof n === 'number' ? ` ($${n.toFixed(2)}/s)` : '');

const listVideoModels = (async (z) => {
	const { models } = await callTool(z, 'get_node_type', { type: 'video-gen' });
	return ((models ?? []) as Data[]).map((m) => ({ id: m.id, name: `${m.name ?? m.id}${usd(m.usdPerSecond)}` }));
}) satisfies PollingTriggerPerform<typeof noInputs>;

export const videoModelList = defineTrigger({
	key: 'video_model_list',
	noun: 'Model',
	display: { label: 'List Video Models', description: 'Lists video models and their price per second.', hidden: true },
	operation: {
		type: 'polling',
		inputFields: noInputs,
		perform: listVideoModels,
		sample: { id: 'google/veo-3.1-lite', name: 'Google: Veo 3.1 Lite ($0.11/s)' },
	},
});

/** The image models make_image takes, named from the live catalog where it has them. */
const listImageModels = (async (z) => {
	const [listing, catalog] = await Promise.all([
		z.request({ method: 'GET', url: `${baseUrl()}/api/v1/tools` }).then((r) => r.data as Data),
		callTool(z, 'get_node_type', { type: 'image-gen' }).catch(() => ({ models: [] })),
	]);
	const makeImage = ((listing?.tools ?? []) as Data[]).find((t) => t.name === 'make_image');
	const ids: string[] = makeImage?.inputSchema?.properties?.model?.enum ?? [];
	const names = new Map(((catalog.models ?? []) as Data[]).map((m) => [m.id, m.name]));
	return ids.map((id) => ({ id, name: names.get(id) ?? id }));
}) satisfies PollingTriggerPerform<typeof noInputs>;

export const imageModelList = defineTrigger({
	key: 'image_model_list',
	noun: 'Model',
	display: { label: 'List Image Models', description: 'Lists image models.', hidden: true },
	operation: {
		type: 'polling',
		inputFields: noInputs,
		perform: listImageModels,
		sample: { id: 'google/gemini-2.5-flash-image', name: 'Google: Nano Banana' },
	},
});

const runListInputs = defineInputFields([{ key: 'pipelineId', required: false }]);

/** Recent runs of the pipeline picked in the same step. */
const listRuns = (async (z, bundle) => {
	const pipelineId = bundle.inputData.pipelineId;
	if (!pipelineId) return [];
	const { runs } = await callTool(z, 'list_runs', { pipelineId, limit: 50 });
	return ((runs ?? []) as Data[]).map((r) => ({ id: r.runId, name: `${r.startedAt} · ${r.status}` }));
}) satisfies PollingTriggerPerform<typeof runListInputs>;

export const runList = defineTrigger({
	key: 'run_list',
	noun: 'Run',
	display: { label: 'List Runs', description: 'Lists recent runs of a pipeline for dropdowns.', hidden: true },
	operation: {
		type: 'polling',
		inputFields: runListInputs,
		perform: listRuns,
		sample: { id: '2026-11-05T17:37:04.722Z#60761e1e', name: '2026-11-05T17:37:04.722Z · success' },
	},
});
