import { defineCreate, defineInputFields, type CreatePerform, type CreatePerformResume } from 'zapier-platform-core';

import { NAME, RENDER_OUTPUT_FIELDS, RENDER_SAMPLE, maxCost } from '../fields.js';
import { awaitRender, compact, finishedResult, quoteSummary, requestTool, startQuoted, toLibraryUrl, type Data } from '../treza.js';
import { renderExtra } from './shared.js';

const SHAPES = ['1:1', '16:9', '9:16', '4:5', '3:4', '4:3', '2:3', '3:2', '5:4', '21:9'];

const inputFields = defineInputFields([
	{ key: 'prompt', label: 'Prompt', type: 'text', required: true, helpText: 'What the picture shows. With reference pictures, what to change about them.' },
	maxCost('0.50'),
	{
		key: 'aspectRatio',
		label: 'Shape',
		required: false,
		choices: SHAPES.map((s) => ({ value: s, label: s, sample: s })),
		helpText: 'Leave empty to let the model choose (square, or the shape of the reference).',
	},
	{ key: 'model', label: 'Model', required: false, dynamic: 'image_model_list.id.name', helpText: "Leave empty for Treza's default." },
	{ key: 'referenceImages', label: 'Reference pictures', type: 'file', list: true, required: false, helpText: 'Up to 4 pictures to restyle or combine.' },
	NAME,
]);

const perform = (async (z, bundle) => {
	const startedAt = Date.now();
	const d = bundle.inputData;
	const files = (Array.isArray(d.referenceImages) ? d.referenceImages : [d.referenceImages]).filter(Boolean).map(String);
	if (files.length > 4) throw new z.errors.Error('Add at most 4 reference pictures.', 'InvalidInput', 400);
	const referenceImageUrls = await Promise.all(files.map((f) => toLibraryUrl(z, f)));
	const maxCostUsd = Number(d.maxCostUsd);
	const args = compact({ prompt: d.prompt, aspectRatio: d.aspectRatio, model: d.model, referenceImageUrls, name: d.name, maxPriceUsd: maxCostUsd });
	const started = await startQuoted(z, maxCostUsd, () => requestTool(z, 'make_image', args));
	return awaitRender(z, bundle, { ...started, extra: quoteSummary(started.quoted) }, 'image', startedAt);
}) satisfies CreatePerform<typeof inputFields>;

const performResume = (async (z, bundle) =>
	finishedResult(z, bundle.cleanedRequest as Data, renderExtra(bundle.outputData as Data), 'image')) satisfies CreatePerformResume<typeof inputFields>;

export default defineCreate({
	key: 'generate_image',
	noun: 'Image',
	display: {
		label: 'Generate Image',
		description: 'Generates a picture from a prompt, or restyles reference pictures, with a price cap.',
	},
	operation: {
		inputFields,
		perform,
		performResume,
		sample: RENDER_SAMPLE,
		outputFields: RENDER_OUTPUT_FIELDS,
	},
});
