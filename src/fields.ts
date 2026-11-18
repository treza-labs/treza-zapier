import { defineInputField } from 'zapier-platform-core';

/**
 * Real Treza files for samples. Zapier tests the next step with the sample when
 * there is no live data, so these must download: a made-up link fails that test.
 */
export const SAMPLE_IMAGE_URL = 'https://media.trezalabs.com/api/media/generated/image/94001a28-63ff-444f-84cb-cda99b38ca45.png?s=8X6suchWjDdg9tvKzm6fySo7';
export const SAMPLE_VIDEO_URL = 'https://media.trezalabs.com/api/media/generated/cutaway0/33f2be3e-620d-46c9-8da2-06ca3dca05b8.mp4?s=n7YxmxN9kjkp-THOnJeoabe7';

/** A pipeline, picked from the account's list. */
export const PIPELINE = defineInputField({
	key: 'pipelineId',
	label: 'Pipeline',
	required: true,
	dynamic: 'pipeline_list.id.name',
	helpText: 'One of your Treza pipelines.',
});

/**
 * An optional price cap on a quoted render. Left empty, the step runs at
 * whatever Treza quotes, as long as the balance covers it: a default cap
 * stopped clips people meant to make (Seedance 2.5 over 6 seconds is more
 * than the old $2 default, 2026-11-18).
 */
export const MAX_COST = defineInputField({
	key: 'maxCostUsd',
	label: 'Max cost (USD)',
	type: 'number',
	required: false,
	helpText:
		'Optional. The most this step may spend. Treza quotes the price first; if it is higher, the step stops and nothing is charged. Leave empty for no limit.',
});

/** The cap as a number: Infinity when the field is empty or not a positive number. */
export function costCap(value: unknown): number {
	if (value === undefined || value === null || value === '') return Infinity;
	const cap = Number(value);
	return Number.isFinite(cap) && cap > 0 ? cap : Infinity;
}

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
	url: SAMPLE_VIDEO_URL,
	status: 'success',
	finished: true,
	durationSeconds: 38.6,
	outputs: { video: SAMPLE_VIDEO_URL },
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
	url: SAMPLE_IMAGE_URL,
	status: 'success',
	finished: true,
	estimatedChargeUsd: 0.06,
	model: 'google/gemini-2.5-flash-image',
	durationSeconds: 6.6,
	outputs: { image: SAMPLE_IMAGE_URL },
	runId: '2026-11-05T17:37:04.722Z#60761e1e',
	pipelineId: 'pipeline_1793481891925_m4p901yqr',
	trigger: 'api',
	startedAt: '2026-11-05T17:37:04.963Z',
	finishedAt: '2026-11-05T17:37:11.567Z',
};
