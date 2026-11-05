// A stand-in for Treza's REST API (/api/v1/tools/<name>), with the shapes of
// treza-xyz origin/main, so the Zapier app can be driven end to end without
// spending credits. It runs in the test process and records every request.
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const KEY = 'treza_live_mocktest';

type Data = Record<string, any>;
export interface Call {
	method: string;
	path: string;
	tool?: string;
	args?: Data;
	auth?: string;
	ua?: string;
	bytes?: number;
}

export interface Mock {
	base: string;
	calls: Call[];
	/** Whether run_pipeline advertises callbackUrl (Treza's run callbacks shipped). */
	callbacks: boolean;
	/** The finished-run payload get_run would give for a run (what Treza POSTs to the callback). */
	finished(runId: string): Data;
	/** Runs that never finish, to exercise the inline wait running out. */
	stuck: boolean;
	balanceUsd: number;
	close(): Promise<void>;
	tools(): string[];
}

export async function startMock(): Promise<Mock> {
	const calls: Call[] = [];
	let base = '';
	let n = 0;
	const now = () => new Date().toISOString();
	const quotes = new Map<string, Data>();
	const requests = new Map<string, string>();
	const runs = new Map<string, Data>();
	const uploads = new Map<string, Data>();
	const pipelines = new Map<string, Data>([
		['pipeline_demo', { id: 'pipeline_demo', name: 'Demo clipper', priceUsd: 1.5 }],
	]);
	const staleServed = new Set<string>();

	const mock: Mock = {
		base: '',
		calls,
		callbacks: false,
		stuck: false,
		balanceUsd: 10,
		finished: (runId) => runView(runs.get(runId)!, true),
		close: () => new Promise((resolve) => server.close(() => resolve())),
		tools: () => calls.filter((c) => c.tool).map((c) => c.tool!),
	};

	function startRun(pipelineId: string, kind: string, extra: Data = {}): string {
		const runId = `${now()}#${(++n).toString(16).padStart(8, '0')}`;
		runs.set(runId, { runId, pipelineId, kind, polls: 0, startedAt: now(), ...extra });
		return runId;
	}

	function runView(run: Data, final = false): Data {
		// Once any view has shown a run finished (list_runs, a callback), every view agrees.
		if (final) run.done = true;
		else run.polls++;
		if (!run.done && (mock.stuck || run.polls <= 2) && !run.cancelled) {
			return { runId: run.runId, pipelineId: run.pipelineId, status: 'running', trigger: 'api', startedAt: run.startedAt, progress: { done: 0, total: 1 }, pollAfterSec: 2 };
		}
		const status = run.cancelled ? 'cancelled' : run.fail ? 'error' : 'success';
		const file = run.kind === 'image' ? `${base}/files/image.png?sig=abc` : `${base}/files/clip.mp4?sig=abc`;
		const key = run.kind === 'pipeline' ? 'final_cut' : run.kind;
		return {
			runId: run.runId,
			pipelineId: run.pipelineId,
			status,
			trigger: 'api',
			startedAt: run.startedAt,
			finishedAt: now(),
			durationMs: 9000,
			...(status === 'success' ? { outputs: { [key]: file }, note: 'To add music, pass its url to assemble_video.' } : {}),
			...(status === 'error' ? { statusNote: 'The video model refused the prompt.' } : {}),
			nodes: [{ nodeId: 'n1', type: 'video-gen', label: 'Video', status: status === 'success' ? 'success' : 'error', ...(status === 'error' ? { error: 'Model refused: unsafe content' } : {}) }],
		};
	}

	function quote(pipelineId: string, chargeUsd: number, staleOnce = false): Data {
		const quoteId = `q_${(++n).toString(36)}`;
		quotes.set(quoteId, { pipelineId, chargeUsd, staleOnce });
		return {
			pipelineId,
			quoteId,
			estimatedChargeUsd: chargeUsd,
			balanceUsd: mock.balanceUsd,
			sufficient: chargeUsd <= mock.balanceUsd,
			...(chargeUsd > mock.balanceUsd ? { topUpUrl: 'https://www.trezalabs.com/platform/settings' } : { goAheadNote: 'Covered.' }),
		};
	}

	const refuse = (status: number, body: Data) => ({ __status: status, body });
	const staleOnce = (prompt: string) => {
		const tag = /\[stale:(\w+)\]/.exec(prompt)?.[1];
		if (!tag || staleServed.has(tag)) return false;
		staleServed.add(tag);
		return true;
	};

	const tools: Record<string, (a: Data) => Data> = {
		get_profile: () => ({ id: 'acct_mock', email: 'creator@example.com' }),
		get_credit_balance: () => ({ balanceUsd: mock.balanceUsd }),
		get_node_type: (a) =>
			a.type === 'video-gen'
				? { type: 'video-gen', models: [{ id: 'google/veo-3.1-lite', name: 'Google: Veo 3.1 Lite', usdPerSecond: 0.112 }, { id: 'kwaivgi/kling-v3.0-std', name: 'Kling: Video v3.0 Standard', usdPerSecond: 0.176 }] }
				: { type: a.type, models: [{ id: 'google/gemini-2.5-flash-image', name: 'Google: Nano Banana' }] },
		make_video: (a) => {
			const durationSec = a.durationSec ?? 4;
			const price = Math.round(durationSec * 0.25 * 100) / 100;
			if (typeof a.maxPriceUsd === 'number' && price > a.maxPriceUsd) {
				return refuse(400, { error: `This video costs $${price}, over the $${a.maxPriceUsd} limit. Nothing was created or charged.`, code: 'OVER_BUDGET', estimatedChargeUsd: price });
			}
			pipelines.set('pipeline_scratch', { id: 'pipeline_scratch', name: 'Scratch', kind: 'video', fail: /\[fail\]/.test(a.prompt) });
			return { ...quote('pipeline_scratch', price, staleOnce(a.prompt)), model: { id: a.model || 'google/veo-3.1-lite', name: 'Veo 3.1 Lite' }, durationSec, aspectRatio: a.aspectRatio ?? '16:9', canvasDefaults: ['prompt'], note: 'Prepared.' };
		},
		make_image: (a) => {
			pipelines.set('pipeline_scratch', { id: 'pipeline_scratch', name: 'Scratch', kind: 'image' });
			return { ...quote('pipeline_scratch', 0.06), model: { id: a.model || 'google/gemini-2.5-flash-image', name: 'Nano Banana' }, aspectRatio: a.aspectRatio, note: 'Prepared.' };
		},
		estimate_run_cost: (a) => {
			const p = pipelines.get(a.pipelineId);
			if (!p) return refuse(404, { error: 'Pipeline not found or access denied.' });
			return quote(a.pipelineId, p.priceUsd ?? 1);
		},
		run_pipeline: (a) => {
			const p = pipelines.get(a.pipelineId);
			if (!p) return refuse(404, { error: 'Pipeline not found or access denied.' });
			const extra = { fail: p.fail, inputs: a.inputs, callbackUrl: a.callbackUrl };
			if (a.quoteId) {
				const q = quotes.get(a.quoteId);
				if (!q) return refuse(400, { error: 'Not a current quote.', code: 'UNKNOWN_QUOTE' });
				if (q.staleOnce) {
					quotes.delete(a.quoteId);
					return refuse(400, { error: 'The pipeline changed after the quote priced it.', code: 'STALE_QUOTE' });
				}
				if (p.id === 'pipeline_demo' && a.inputs?.text_1 === 'long') {
					return refuse(400, { error: 'This run now costs $3.00, more than the $1.50 quote.', code: 'PRICE_CHANGED', estimatedChargeUsd: 3 });
				}
				q.runId ??= startRun(a.pipelineId, p.kind ?? 'pipeline', extra);
				return { runId: q.runId, status: 'running', startedAt: now() };
			}
			if (a.requestId && requests.has(a.requestId)) return { runId: requests.get(a.requestId), status: 'running', repeat: true };
			const runId = startRun(a.pipelineId, p.kind ?? 'pipeline', extra);
			if (a.requestId) requests.set(a.requestId, runId);
			return { runId, status: 'running', startedAt: now() };
		},
		get_run: (a) => {
			const run = runs.get(a.runId);
			if (!run) return refuse(404, { error: 'Run not found.' });
			return runView(run);
		},
		list_runs: (a) => ({
			runs: [...runs.values()]
				.filter((r) => r.pipelineId === a.pipelineId)
				.reverse()
				.slice(0, a.limit ?? 10)
				.map((r) => {
					const v = runView(r, true);
					return { runId: r.runId, status: v.status, trigger: 'api', startedAt: r.startedAt, finishedAt: v.finishedAt, durationMs: 9000 };
				}),
		}),
		list_pipelines: () => ({ pipelines: [...pipelines.values()].map((p) => ({ id: p.id, name: p.name, status: 'draft' })) }),
		get_pipeline: (a) => {
			const p = pipelines.get(a.pipelineId);
			if (!p) return refuse(404, { error: 'Pipeline not found or access denied.' });
			return { id: p.id, name: p.name, entryNodes: [{ id: 'text_1', type: 'text-input', label: 'Topic' }, { id: 'payload_1', type: 'webhook-trigger', label: 'Payload' }, { id: 'file_1', type: 'file', label: 'Source video' }] };
		},
		assemble_video: (a) => {
			if (a.requestId && requests.has(a.requestId)) return { runId: requests.get(a.requestId), pipelineId: 'pipeline_asm', status: 'running', repeat: true };
			pipelines.set('pipeline_asm', { id: 'pipeline_asm', name: 'Assembled', kind: 'video' });
			const runId = startRun('pipeline_asm', 'video', { callbackUrl: a.callbackUrl });
			if (a.requestId) requests.set(a.requestId, runId);
			return { runId, pipelineId: 'pipeline_asm', status: 'running', startedAt: now(), charged: false, clips: a.clipUrls.length, lengthSec: 6, note: 'Assembling.' };
		},
		create_upload_url: (a) => {
			const uid = `up_${++n}`;
			uploads.set(uid, { contentType: a.contentType });
			return { uploadUrl: `${base}/upload/${uid}`, method: 'PUT', mediaUrl: `${base}/uploaded/${uid}` };
		},
		import_media: (a) => {
			const uid = String(a.url).split('/').pop()!;
			const up = uploads.get(uid);
			if (String(a.url).startsWith(`${base}/uploaded/`) && !up?.bytes) return refuse(400, { error: 'Nothing was uploaded there.', code: 'NOT_UPLOADED' });
			return { url: `${base}/files/${up?.contentType?.startsWith('image') ? 'image.png' : 'clip.mp4'}?lib=${uid}`, kind: up?.contentType?.split('/')[0] ?? 'video', name: a.name ?? 'file', bytes: up?.bytes ?? 0 };
		},
	};

	const server = http.createServer(async (req, res) => {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		const raw = Buffer.concat(chunks);
		const url = new URL(req.url!, base);
		const call: Call = { method: req.method!, path: url.pathname, auth: req.headers.authorization, ua: req.headers['user-agent'] };
		calls.push(call);
		const send = (status: number, body: unknown, type = 'application/json') => {
			res.writeHead(status, { 'content-type': type });
			res.end(type === 'application/json' ? JSON.stringify(body) : (body as Buffer));
		};

		// /files/ is Treza library media; /external/ stands for a file another Zap step shares.
		if (req.method === 'GET' && (url.pathname.startsWith('/files/') || url.pathname.startsWith('/external/'))) {
			const f = url.pathname.split('/').pop()!;
			const type = f.endsWith('.png') ? 'image/png' : f.endsWith('.pdf') ? 'application/pdf' : 'video/mp4';
			return send(200, fs.readFileSync(path.join(fixtures, f)), type);
		}
		if (req.method === 'PUT' && url.pathname.startsWith('/upload/')) {
			const up = uploads.get(url.pathname.split('/').pop()!);
			if (!up || req.headers['content-type'] !== up.contentType) return send(403, { error: 'Signature mismatch' });
			up.bytes = raw.length;
			call.bytes = raw.length;
			return send(200, {});
		}
		if (req.method === 'GET' && url.pathname === '/api/v1/tools') {
			return send(200, {
				tools: Object.keys(tools).map((name) => ({
					name,
					inputSchema:
						name === 'make_image'
							? { properties: { model: { enum: ['google/gemini-2.5-flash-image', 'openai/gpt-image-2'] } } }
							: name === 'run_pipeline' && mock.callbacks
								? { properties: { pipelineId: {}, callbackUrl: { type: 'string' } } }
								: { properties: {} },
				})),
			});
		}
		const m = url.pathname.match(/^\/api\/v1\/tools\/([a-z_]+)$/);
		if (req.method !== 'POST' || !m) return send(404, { error: 'Not found' });
		call.tool = m[1];
		call.args = raw.length ? JSON.parse(raw.toString()) : {};
		if (req.headers.authorization !== `Bearer ${KEY}`) {
			return send(401, { error: 'Send a Treza API key as "Authorization: Bearer treza_live_...".', code: 'UNAUTHORIZED' });
		}
		const tool = tools[m[1]!];
		if (!tool) return send(404, { error: `There is no tool named "${m[1]}".`, code: 'UNKNOWN_TOOL' });
		const out = tool(call.args!);
		if (out && out.__status) return send(out.__status, out.body);
		return send(200, out);
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	mock.base = base;
	return mock;
}
