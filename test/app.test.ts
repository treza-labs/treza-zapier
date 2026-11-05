import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import zapier from 'zapier-platform-core';

import App from '../src/index.js';
import { resetCallbackSupport } from '../src/treza.js';
import { KEY, startMock, type Mock } from './mock-treza.js';

const appTester = zapier.createAppTester(App);
const auth = { apiKey: KEY };
// What zapier-platform-core's app tester hands out as z.generateCallbackUrl().
const CALLBACK = 'https://auth-json-server.zapier-staging.com/echo';

let mock: Mock;
beforeAll(async () => {
	mock = await startMock();
	process.env.TREZA_BASE_URL = mock.base;
	process.env.TREZA_INLINE_WAIT_MS = '9000';
});
afterAll(() => mock.close());
beforeEach(() => {
	mock.calls.length = 0;
	mock.callbacks = false;
	mock.stuck = false;
	mock.balanceUsd = 10;
	resetCallbackSupport();
});

const toolCalls = (name: string) => mock.calls.filter((c) => c.tool === name);
const run = (key: string, inputData: Record<string, unknown>) =>
	appTester((App.creates as any)[key].operation.perform, { authData: auth, inputData });
const resume = (key: string, outputData: Record<string, unknown>, cleanedRequest: Record<string, unknown>) =>
	appTester((App.creates as any)[key].operation.performResume, { authData: auth, inputData: {}, outputData, cleanedRequest } as any);

describe('authentication', () => {
	it('labels the connection with the account email', async () => {
		const profile = await appTester(App.authentication.test as any, { authData: auth });
		expect(profile).toMatchObject({ email: 'creator@example.com' });
		expect(App.authentication.connectionLabel).toBe('{{email}}');
		const call = toolCalls('get_profile')[0]!;
		expect(call.auth).toBe(`Bearer ${KEY}`);
		expect(call.ua).toMatch(/^treza-zapier\//);
	});

	it('a wrong key says to reconnect', async () => {
		await expect(appTester(App.authentication.test as any, { authData: { apiKey: 'treza_live_wrong' } })).rejects.toThrow(/Reconnect your Treza account/);
	});
});

describe('dropdowns', () => {
	it('lists pipelines, video models with prices, and image models by name', async () => {
		const pipelines = await appTester(App.triggers.pipeline_list.operation.perform as any, { authData: auth, inputData: {} });
		expect(pipelines).toContainEqual({ id: 'pipeline_demo', name: 'Demo clipper' });
		const video = await appTester(App.triggers.video_model_list.operation.perform as any, { authData: auth, inputData: {} });
		expect(video).toContainEqual({ id: 'google/veo-3.1-lite', name: 'Google: Veo 3.1 Lite ($0.11/s)' });
		const image = await appTester(App.triggers.image_model_list.operation.perform as any, { authData: auth, inputData: {} });
		expect(image).toEqual([
			{ id: 'google/gemini-2.5-flash-image', name: 'Google: Nano Banana' },
			{ id: 'openai/gpt-image-2', name: 'openai/gpt-image-2' },
		]);
	});
});

describe('Generate Image', () => {
	it('without Treza callbacks: quotes, starts once at the quote, waits inline and returns the file', async () => {
		const item = await run('generate_image', { prompt: 'a red fox in snow', aspectRatio: '1:1', maxCostUsd: '0.50' });
		expect(item).toMatchObject({ status: 'success', finished: true, estimatedChargeUsd: 0.06, model: 'google/gemini-2.5-flash-image' });
		expect(item.url).toMatch(/image\.png/);
		expect(item).not.toHaveProperty('note');
		const [start] = toolCalls('run_pipeline');
		expect(start!.args).toMatchObject({ pipelineId: 'pipeline_scratch' });
		expect(start!.args!.quoteId).toBeTruthy();
		expect(start!.args).not.toHaveProperty('callbackUrl');
	});

	it('reference pictures from another app are uploaded to the library first, without the API key', async () => {
		await run('generate_image', { prompt: 'restyle', maxCostUsd: '0.50', referenceImages: [`${mock.base}/external/image.png`, `${mock.base}/files/image.png?sig=lib`] });
		const refs = toolCalls('make_image')[0]!.args!.referenceImageUrls;
		expect(refs[0]).toMatch(/\/files\/image\.png\?lib=up_/);
		expect(refs[1]).toBe(`${mock.base}/files/image.png?sig=lib`);
		expect(toolCalls('create_upload_url')).toHaveLength(1);
		expect(mock.calls.find((c) => c.path === '/external/image.png')!.auth).toBeUndefined();
	});

	it('a file link that does not download stops before anything is quoted', async () => {
		await expect(run('generate_image', { prompt: 'restyle', maxCostUsd: '0.50', referenceImages: [`${mock.base}/missing/image.png`] })).rejects.toThrow(/could not be downloaded/);
		expect(toolCalls('make_image')).toHaveLength(0);
	});
});

describe('Generate Video', () => {
	it('with Treza callbacks: passes the callback URL and waits for Treza, then resumes with the finished run', async () => {
		mock.callbacks = true;
		const pending = await run('generate_video', { prompt: 'otter', aspectRatio: '9:16', durationSec: '4', maxCostUsd: '2', withAudio: 'false' });
		expect(pending).toMatchObject({ status: 'running', finished: false, estimatedChargeUsd: 1, model: 'google/veo-3.1-lite', aspectRatio: '9:16' });
		expect(toolCalls('make_video')[0]!.args).toMatchObject({ prompt: 'otter', aspectRatio: '9:16', durationSec: 4, withAudio: false, maxPriceUsd: 2 });
		expect(toolCalls('run_pipeline')[0]!.args).toMatchObject({ callbackUrl: CALLBACK });
		expect(toolCalls('get_run')).toHaveLength(0);

		const finished = await resume('generate_video', pending, mock.finished(pending.runId));
		expect(finished).toMatchObject({ status: 'success', finished: true, estimatedChargeUsd: 1, model: 'google/veo-3.1-lite', runId: pending.runId });
		expect(finished.url).toMatch(/clip\.mp4/);
		expect(finished).not.toHaveProperty('note');
	});

	it('a render that stops early fails the step with the reason', async () => {
		mock.callbacks = true;
		const pending = await run('generate_video', { prompt: 'otter [fail]', maxCostUsd: '2' });
		await expect(resume('generate_video', pending, mock.finished(pending.runId))).rejects.toThrow(/stopped before it finished.*refused/);
	});

	it('over Max cost: stops before anything runs', async () => {
		await expect(run('generate_video', { prompt: 'otter', durationSec: '12', maxCostUsd: '2' })).rejects.toThrow(/costs \$3\.00, over the Max cost of \$2\.00\. Nothing was charged/);
		expect(toolCalls('run_pipeline')).toHaveLength(0);
	});

	it('a balance that does not cover it: stops with the top-up link', async () => {
		mock.balanceUsd = 0.5;
		await expect(run('generate_video', { prompt: 'otter', maxCostUsd: '2' })).rejects.toThrow(/balance is \$0\.50\. Nothing was charged\. Add credits at https:\/\/www\.trezalabs\.com/);
		expect(toolCalls('run_pipeline')).toHaveLength(0);
	});

	it('a quote another render took first is quoted again', async () => {
		mock.callbacks = true;
		const pending = await run('generate_video', { prompt: 'otter [stale:a]', maxCostUsd: '2' });
		expect(pending.runId).toBeTruthy();
		expect(toolCalls('make_video')).toHaveLength(2);
		expect(toolCalls('run_pipeline')).toHaveLength(2);
	});

	it('without callbacks, a render that outlasts the step comes back running with a note', async () => {
		mock.stuck = true;
		const item = await run('generate_video', { prompt: 'otter', maxCostUsd: '2' });
		expect(item).toMatchObject({ status: 'running', finished: false });
		expect(item.note).toMatch(/Run Finished trigger/);
	}, 20_000);
});

describe('Run Pipeline', () => {
	it('builds a field per input step', async () => {
		const fields = await appTester((App.creates.run_pipeline.operation.inputFields as any)[1], { authData: auth, inputData: { pipelineId: 'pipeline_demo' } });
		expect(fields.map((f: any) => [f.key, f.type])).toEqual([
			['input__text_1', 'text'],
			['input__payload_1', 'text'],
			['input__file_1', 'file'],
		]);
	});

	it('sends text, parsed JSON and an uploaded file, quoted', async () => {
		mock.callbacks = true;
		const pending = await run('run_pipeline', {
			pipelineId: 'pipeline_demo',
			input__text_1: 'spring sale',
			input__payload_1: '{"title":"Spring"}',
			input__file_1: `${mock.base}/external/clip.mp4`,
			maxCostUsd: '5',
		});
		expect(pending).toMatchObject({ status: 'running', estimatedChargeUsd: 1.5 });
		const args = toolCalls('run_pipeline')[0]!.args!;
		expect(args).toMatchObject({ pipelineId: 'pipeline_demo', callbackUrl: CALLBACK, inputs: { text_1: 'spring sale', payload_1: { title: 'Spring' } } });
		expect(args.inputs.file_1).toMatch(/\/files\/clip\.mp4\?lib=up_/);
	});

	it('bad JSON in a JSON input stops before anything is quoted', async () => {
		await expect(run('run_pipeline', { pipelineId: 'pipeline_demo', input__payload_1: '{nope', maxCostUsd: '5' })).rejects.toThrow(/Payload must be JSON/);
		expect(toolCalls('estimate_run_cost')).toHaveLength(0);
	});

	it('inputs that raise the price but stay under Max cost run once, by request ID', async () => {
		mock.callbacks = true;
		await run('run_pipeline', { pipelineId: 'pipeline_demo', input__text_1: 'long', maxCostUsd: '5' });
		const starts = toolCalls('run_pipeline');
		expect(starts).toHaveLength(2);
		expect(starts[1]!.args!.requestId).toBeTruthy();
		expect(starts[1]!.args!.quoteId).toBeUndefined();
	});

	it('inputs that raise the price over Max cost stop the step', async () => {
		await expect(run('run_pipeline', { pipelineId: 'pipeline_demo', input__text_1: 'long', maxCostUsd: '2' })).rejects.toThrow(/costs \$3\.00, over the Max cost of \$2\.00/);
		expect(toolCalls('run_pipeline')).toHaveLength(1);
	});
});

describe('Assemble Video', () => {
	it('sends the clips, a request ID and the callback URL', async () => {
		mock.callbacks = true;
		const pending = await run('assemble_video', { clips: [`${mock.base}/files/clip.mp4`, `${mock.base}/files/image.png`], musicPrompt: 'lofi', captions: 'true', transition: 'fade' });
		expect(pending).toMatchObject({ status: 'running', lengthSec: 6 });
		const args = toolCalls('assemble_video')[0]!.args!;
		expect(args).toMatchObject({ musicPrompt: 'lofi', captions: true, transition: 'fade', callbackUrl: CALLBACK });
		expect(args.clipUrls).toHaveLength(2);
		expect(args.requestId).toBeTruthy();
		const finished = await resume('assemble_video', pending, mock.finished(pending.runId));
		expect(finished).toMatchObject({ status: 'success', lengthSec: 6 });
	});
});

describe('Upload File', () => {
	it('downloads the file, uploads it to the signed URL and imports it, sending the key only to the API', async () => {
		const item = await run('upload_file', { file: `${mock.base}/external/image.png`, name: 'Logo' });
		expect(item).toMatchObject({ kind: 'image', name: 'Logo', bytes: 1884 });
		const download = mock.calls.find((c) => c.method === 'GET' && c.path === '/external/image.png')!;
		const put = mock.calls.find((c) => c.method === 'PUT')!;
		expect(download.auth).toBeUndefined();
		expect(put.auth).toBeUndefined();
		expect(put.bytes).toBe(1884);
	});

	it('a type Treza does not take stops before anything is uploaded', async () => {
		await expect(run('upload_file', { file: `${mock.base}/external/doc.pdf` })).rejects.toThrow(/can't take a application\/pdf/);
		expect(toolCalls('create_upload_url')).toHaveLength(0);
	});
});

describe('Run Finished trigger and Find Run', () => {
	it('emits finished runs with their files, newest first, filtered by ending', async () => {
		await run('generate_image', { prompt: 'one', maxCostUsd: '0.50' });
		await run('generate_image', { prompt: 'two', maxCostUsd: '0.50' });
		const items = await appTester(App.triggers.run_finished.operation.perform as any, { authData: auth, inputData: { pipelineId: 'pipeline_scratch', statuses: ['success'] } });
		expect(items.length).toBeGreaterThanOrEqual(2);
		expect(items[0]).toMatchObject({ status: 'success', pipelineId: 'pipeline_scratch' });
		expect(items[0].id).toBe(items[0].runId);
		expect(items[0].url).toMatch(/image\.png/);
		// The [fail] render from the Generate Video tests is the only failed run here.
		const failed = await appTester(App.triggers.run_finished.operation.perform as any, { authData: auth, inputData: { pipelineId: 'pipeline_scratch', statuses: ['error'] } });
		expect(failed.length).toBeGreaterThanOrEqual(1);
		expect(failed.every((i: any) => i.status === 'error' && /refused/.test(i.statusNote))).toBe(true);
	});

	it('finds a run, and returns nothing for an unknown one', async () => {
		const made = await run('generate_image', { prompt: 'find me', maxCostUsd: '0.50' });
		const [found] = await appTester(App.searches.find_run.operation.perform as any, { authData: auth, inputData: { pipelineId: made.pipelineId, runId: made.runId } });
		expect(found).toMatchObject({ runId: made.runId, status: 'success' });
		const missing = await appTester(App.searches.find_run.operation.perform as any, { authData: auth, inputData: { pipelineId: made.pipelineId, runId: 'nope' } });
		expect(missing).toEqual([]);
	});
});
