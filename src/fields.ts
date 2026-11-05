import { defineInputField } from 'zapier-platform-core';

/** A pipeline, picked from the account's list. */
export const PIPELINE = defineInputField({
	key: 'pipelineId',
	label: 'Pipeline',
	required: true,
	dynamic: 'pipeline_list.id.name',
	helpText: 'One of your Treza pipelines.',
});

/** The price cap every quoted render needs, since no one approves a price inside a Zap. */
export const maxCost = (defaultUsd: string) =>
	defineInputField({
		key: 'maxCostUsd',
		label: 'Max cost (USD)',
		type: 'number',
		required: true,
		default: defaultUsd,
		helpText:
			'The most this step may spend. Treza quotes the price first; if it is higher, the step stops and nothing is charged.',
	});

export const NAME = defineInputField({
	key: 'name',
	label: 'Name',
	required: false,
	helpText: 'What to call the render in Treza.',
});

/** Output field labels shared by every render. */
export const RENDER_OUTPUT_FIELDS = [
	{ key: 'url', label: 'File URL' },
	{ key: 'status', label: 'Status' },
	{ key: 'finished', label: 'Finished', type: 'boolean' as const },
	{ key: 'estimatedChargeUsd', label: 'Price (USD)', type: 'number' as const },
	{ key: 'model', label: 'Model' },
	{ key: 'durationSeconds', label: 'Render time (seconds)', type: 'number' as const },
	{ key: 'runId', label: 'Run ID' },
	{ key: 'pipelineId', label: 'Pipeline ID' },
	{ key: 'startedAt', label: 'Started at', type: 'datetime' as const },
	{ key: 'finishedAt', label: 'Finished at', type: 'datetime' as const },
	{ key: 'statusNote', label: 'Status note' },
];

/**
 * A finished run as Run Finished and Find Run return it: no price or model,
 * which only the step that starts a render knows. Zapier checks the trigger's
 * sample against live items, key for key.
 */
export const RUN_SAMPLE = {
	id: '2026-11-05T20:57:03.674Z#9729af5f',
	url: 'https://media.trezalabs.com/api/media/generated/video/54407e0c-3b5e-4b6f-84eb-9962d7188de3.mp4',
	status: 'success',
	finished: true,
	durationSeconds: 38.6,
	outputs: { video: 'https://media.trezalabs.com/api/media/generated/video/54407e0c-3b5e-4b6f-84eb-9962d7188de3.mp4' },
	runId: '2026-11-05T20:57:03.674Z#9729af5f',
	pipelineId: 'pipeline_1793911299446_1o0jzvvse',
	trigger: 'api',
	startedAt: '2026-11-05T20:57:03.808Z',
	finishedAt: '2026-11-05T20:57:42.378Z',
};

/** Output labels for a finished run (Run Finished, Find Run). */
export const RUN_OUTPUT_FIELDS = [
	{ key: 'url', label: 'File URL' },
	{ key: 'status', label: 'Status' },
	{ key: 'finished', label: 'Finished', type: 'boolean' as const },
	{ key: 'durationSeconds', label: 'Render time (seconds)', type: 'number' as const },
	{ key: 'runId', label: 'Run ID' },
	{ key: 'pipelineId', label: 'Pipeline ID' },
	{ key: 'startedAt', label: 'Started at', type: 'datetime' as const },
	{ key: 'finishedAt', label: 'Finished at', type: 'datetime' as const },
	{ key: 'statusNote', label: 'Status note' },
];

export const RENDER_SAMPLE = {
	id: '2026-11-05T17:37:04.722Z#60761e1e',
	url: 'https://media.trezalabs.com/api/media/generated/image/94001a28-63ff-444f-84cb-cda99b38ca45.png',
	status: 'success',
	finished: true,
	estimatedChargeUsd: 0.06,
	model: 'google/gemini-2.5-flash-image',
	durationSeconds: 6.6,
	outputs: { image: 'https://media.trezalabs.com/api/media/generated/image/94001a28-63ff-444f-84cb-cda99b38ca45.png' },
	runId: '2026-11-05T17:37:04.722Z#60761e1e',
	pipelineId: 'pipeline_1793481891925_m4p901yqr',
	trigger: 'api',
	startedAt: '2026-11-05T17:37:04.963Z',
	finishedAt: '2026-11-05T17:37:11.567Z',
};
