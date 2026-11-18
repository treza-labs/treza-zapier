import { defineCreate, defineInputFields, type CreatePerform, type CreatePerformResume } from 'zapier-platform-core';

import { NAME, RENDER_OUTPUT_FIELDS, RENDER_SAMPLE, SAMPLE_VIDEO_URL, MAX_COST, costCap } from '../fields.js';
import { awaitRender, compact, finishedResult, quoteSummary, requestTool, startQuoted, toLibraryUrl, type Data } from '../treza.js';
import { optionalBool, renderExtra, toNumber } from './shared.js';

const inputFields = defineInputFields([
	{ key: 'prompt', label: 'Prompt', type: 'text', required: true, helpText: 'What the video shows: the subject, the action, the setting and the camera.' },
	MAX_COST,
	{
		key: 'aspectRatio',
		label: 'Shape',
		required: false,
		default: '16:9',
		choices: [
			{ value: '16:9', label: 'Horizontal (16:9)', sample: '16:9' },
			{ value: '9:16', label: 'Vertical (9:16) for Shorts, Reels and TikTok', sample: '9:16' },
			{ value: '1:1', label: 'Square (1:1)', sample: '1:1' },
		],
	},
	{ key: 'durationSec', label: 'Length (seconds)', type: 'integer', required: false, helpText: 'Models that render fixed lengths use the next one up.' },
	{ key: 'model', label: 'Model', required: false, dynamic: 'video_model_list.id.name', helpText: "Leave empty for Treza's default. The price per second is in the list." },
	{ key: 'firstFrame', label: 'First frame', type: 'file', required: false, helpText: 'A picture for the clip to open on, to animate a still.' },
	{ key: 'lastFrame', label: 'Last frame', type: 'file', required: false, helpText: 'A picture for the clip to end on.' },
	{ key: 'continueFrom', label: 'Continue from video', type: 'file', required: false, helpText: 'A clip to carry on from its last frame.' },
	{ key: 'withAudio', label: 'With sound', type: 'boolean', required: false, default: 'true', helpText: 'Generate sound with the video, on models that can.' },
	NAME,
]);

const perform = (async (z, bundle) => {
	const startedAt = Date.now();
	const d = bundle.inputData;
	const [firstFrameUrl, lastFrameUrl, continueFromVideoUrl] = await Promise.all(
		[d.firstFrame, d.lastFrame, d.continueFrom].map((f) => (f ? toLibraryUrl(z, String(f)) : undefined)),
	);
	const maxCostUsd = costCap(d.maxCostUsd);
	const args = compact({
		prompt: d.prompt,
		aspectRatio: d.aspectRatio,
		durationSec: toNumber(d.durationSec),
		model: d.model,
		withAudio: optionalBool(d.withAudio),
		name: d.name,
		firstFrameUrl,
		lastFrameUrl,
		continueFromVideoUrl,
		maxPriceUsd: Number.isFinite(maxCostUsd) ? maxCostUsd : undefined,
	});
	const started = await startQuoted(z, bundle, maxCostUsd, () => requestTool(z, 'make_video', args));
	return awaitRender(z, bundle, { ...started, extra: quoteSummary(started.quoted) }, 'video', startedAt);
}) satisfies CreatePerform<typeof inputFields>;

const performResume = (async (z, bundle) =>
	finishedResult(z, bundle.cleanedRequest as Data, renderExtra(bundle.outputData as Data), 'video')) satisfies CreatePerformResume<typeof inputFields>;

export default defineCreate({
	key: 'generate_video',
	noun: 'Video',
	display: {
		label: 'Generate Video',
		description: 'Generates a video clip from a prompt, with a price cap.',
	},
	operation: {
		inputFields,
		perform,
		performResume,
		sample: { ...RENDER_SAMPLE, url: SAMPLE_VIDEO_URL, model: 'google/veo-3.1-lite', estimatedChargeUsd: 0.56, outputs: { video: SAMPLE_VIDEO_URL } },
		outputFields: RENDER_OUTPUT_FIELDS,
	},
});
