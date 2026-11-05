import { randomUUID } from 'node:crypto';
import { defineCreate, defineInputFields, type CreatePerform, type CreatePerformResume } from 'zapier-platform-core';

import { NAME, RENDER_OUTPUT_FIELDS, RENDER_SAMPLE } from '../fields.js';
import { awaitRender, callTool, compact, finishedResult, supportsCallbacks, toLibraryUrl, type Data } from '../treza.js';
import { optionalBool, renderExtra, toNumber } from './shared.js';

const choices = (values: Array<[string, string]>) => values.map(([value, label]) => ({ value, label, sample: value }));

const inputFields = defineInputFields([
	{
		key: 'clips',
		label: 'Clips',
		type: 'file',
		list: true,
		required: true,
		helpText: 'Videos or pictures in play order: two or more, or one with music or narration.',
	},
	{ key: 'musicPrompt', label: 'Music prompt', type: 'text', required: false, helpText: 'Compose a music bed for this cut: genre, mood, tempo and instruments. Use this or Music, not both.' },
	{ key: 'music', label: 'Music', type: 'file', required: false, helpText: 'A music track to lay under the edit.' },
	{ key: 'narration', label: 'Narration', type: 'file', required: false, helpText: 'A voiceover over the whole edit. Everything else ducks under it.' },
	{ key: 'captions', label: 'Burn in captions', type: 'boolean', required: false, default: 'false', helpText: 'Transcribe the finished edit and burn captions in.' },
	{
		key: 'orientation',
		label: 'Orientation',
		required: false,
		choices: choices([
			['match_first', 'Match the first clip'],
			['vertical', 'Vertical (1080x1920)'],
			['horizontal', 'Horizontal (1920x1080)'],
		]),
	},
	{
		key: 'transition',
		label: 'Transition',
		required: false,
		choices: choices([
			['none', 'Hard cut'],
			['fade', 'Fade'],
			['fadeblack', 'Fade through black'],
			['wipeleft', 'Wipe left'],
			['zoomin', 'Zoom in'],
		]),
	},
	{ key: 'stillSeconds', label: 'Seconds per picture', type: 'number', required: false, helpText: 'How long each still holds. Defaults to 3.' },
	{
		key: 'stillMotion',
		label: 'Motion on pictures',
		required: false,
		choices: choices([
			['none', 'None'],
			['ken_burns', 'Ken Burns'],
			['push_in', 'Push in'],
			['pull_out', 'Pull out'],
			['pan_left', 'Pan left'],
			['pan_right', 'Pan right'],
			['pan_up', 'Pan up'],
			['pan_down', 'Pan down'],
		]),
	},
	{ key: 'fadeInSec', label: 'Fade in (seconds)', type: 'number', required: false },
	{ key: 'fadeOutSec', label: 'Fade out (seconds)', type: 'number', required: false },
	NAME,
]);

const perform = (async (z, bundle) => {
	const startedAt = Date.now();
	const d = bundle.inputData as Data;
	const clips = (Array.isArray(d.clips) ? d.clips : [d.clips]).filter(Boolean).map(String);
	if (clips.length === 0) throw new z.errors.Error('Add at least one clip.', 'InvalidInput', 400);
	const [clipUrls, musicUrl, narrationUrl] = await Promise.all([
		Promise.all(clips.map((c) => toLibraryUrl(z, c))),
		d.music ? toLibraryUrl(z, String(d.music)) : undefined,
		d.narration ? toLibraryUrl(z, String(d.narration)) : undefined,
	]);
	const callbackUrl = (await supportsCallbacks(z)) ? z.generateCallbackUrl() : undefined;
	const started = await callTool(
		z,
		'assemble_video',
		compact({
			clipUrls,
			musicUrl,
			narrationUrl,
			musicPrompt: d.musicPrompt,
			captions: optionalBool(d.captions),
			orientation: d.orientation,
			transition: d.transition,
			stillSeconds: toNumber(d.stillSeconds),
			stillMotion: d.stillMotion,
			fadeInSec: toNumber(d.fadeInSec),
			fadeOutSec: toNumber(d.fadeOutSec),
			name: d.name,
			requestId: randomUUID(),
			callbackUrl,
		}),
	);
	return awaitRender(
		z,
		bundle,
		{
			runId: String(started.runId),
			pipelineId: String(started.pipelineId),
			usedCallback: Boolean(callbackUrl),
			extra: compact({ lengthSec: started.lengthSec }),
		},
		'video',
		startedAt,
	);
}) satisfies CreatePerform<typeof inputFields>;

const performResume = (async (z, bundle) =>
	finishedResult(z, bundle.cleanedRequest as Data, renderExtra(bundle.outputData as Data), 'video')) satisfies CreatePerformResume<typeof inputFields>;

export default defineCreate({
	key: 'assemble_video',
	noun: 'Video',
	display: {
		label: 'Assemble Video',
		description: 'Joins clips and pictures into one video, with music, narration, captions and transitions.',
	},
	operation: {
		inputFields,
		perform,
		performResume,
		sample: { ...RENDER_SAMPLE, url: 'https://media.trezalabs.com/api/media/generated/video/cut-91a.mp4', outputs: { video: 'https://media.trezalabs.com/api/media/generated/video/cut-91a.mp4' }, estimatedChargeUsd: 0, model: undefined },
		outputFields: RENDER_OUTPUT_FIELDS,
	},
});
