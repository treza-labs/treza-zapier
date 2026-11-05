import { randomUUID } from 'node:crypto';
import type { Bundle, ZObject } from 'zapier-platform-core';

import packageJson from '../package.json' with { type: 'json' };

/** Treza's REST API. Tests point it at a mock with TREZA_BASE_URL. */
export const baseUrl = (): string => (process.env.TREZA_BASE_URL || 'https://www.trezalabs.com').replace(/\/+$/, '');

export const USER_AGENT = `treza-zapier/${packageJson.version}`;

export const TOP_UP_URL = 'https://www.trezalabs.com/platform/settings';

export type Data = Record<string, any>;

/** A refusal from Treza: the HTTP status and the JSON body (`error`, often `code`). */
export interface Refusal {
	ok: false;
	status: number;
	code?: string;
	body: Data;
}

export type ToolResult<T = Data> = { ok: true; data: T } | Refusal;

/** Drop empty values, so an untouched optional field is left to Treza's default. */
export function compact(fields: Data): Data {
	return Object.fromEntries(
		Object.entries(fields).filter(([, v]) => v !== '' && v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
	);
}

/** Call one tool on Treza's REST API (`POST /api/v1/tools/<name>`) without throwing. */
export async function requestTool<T = Data>(z: ZObject, tool: string, args: Data = {}): Promise<ToolResult<T>> {
	const response = await z.request({
		method: 'POST',
		url: `${baseUrl()}/api/v1/tools/${tool}`,
		body: compact(args),
		skipThrowForStatus: true,
	});
	if (response.status < 400) return { ok: true, data: response.data as T };
	const body: Data = response.data && typeof response.data === 'object' ? (response.data as Data) : { error: String(response.content ?? '') };
	return { ok: false, status: response.status, code: typeof body.code === 'string' ? body.code : undefined, body };
}

/** Call one tool, turning a refusal into an error the Zap history shows. */
export async function callTool<T = Data>(z: ZObject, tool: string, args: Data = {}): Promise<T> {
	const result = await requestTool<T>(z, tool, args);
	if (result.ok) return result.data;
	throw refusalError(z, result);
}

/** The error a user sees for a refusal: Treza's own sentence, plus what to do next. */
export function refusalError(z: ZObject, refusal: Refusal): Error {
	const message = typeof refusal.body.error === 'string' && refusal.body.error ? refusal.body.error : `Treza answered HTTP ${refusal.status}.`;
	if (refusal.status === 401) {
		return new z.errors.Error(`${message} Reconnect your Treza account with a current API key.`, 'AuthenticationError', 401);
	}
	if (refusal.status === 429) {
		return new z.errors.ThrottledError(message, Number(refusal.body.retryAfterSec) || 60);
	}
	if (refusal.status === 402) {
		const topUp = typeof refusal.body.topUpUrl === 'string' ? refusal.body.topUpUrl : TOP_UP_URL;
		return new z.errors.Error(`${message} Add credits at ${topUp}`, refusal.code ?? 'InsufficientCredits', 402);
	}
	return new z.errors.Error(message, refusal.code ?? 'TrezaError', refusal.status);
}

// -------------------------------------------------------------------- runs

const FINISHED = new Set(['success', 'error', 'partial', 'cancelled']);

/** The finished file: the named output, or else the first URL among the outputs. */
export function primaryUrl(run: Data, key?: string): string | undefined {
	const outputs: Data = run.outputs ?? {};
	if (key && typeof outputs[key] === 'string') return outputs[key];
	return Object.values(outputs).find((v): v is string => typeof v === 'string' && /^https?:\/\//.test(v));
}

/**
 * One render as a Zapier item: the finished file up front as `url`, then how
 * it went, what it cost and the IDs to look it up again. Text Treza writes for
 * chat assistants (`note`, `goAheadNote`) is left out.
 */
export function runItem(run: Data, extra: Data = {}, outputKey?: string): Data {
	const status = String(run.status ?? 'running');
	return compact({
		id: run.runId,
		url: primaryUrl(run, outputKey),
		status,
		finished: FINISHED.has(status),
		...extra,
		durationSeconds: typeof run.durationMs === 'number' ? Math.round(run.durationMs / 100) / 10 : undefined,
		outputs: run.outputs,
		runId: run.runId,
		pipelineId: run.pipelineId,
		trigger: run.trigger,
		startedAt: run.startedAt,
		finishedAt: run.finishedAt,
		statusNote: run.statusNote ?? run.refusalNote,
	});
}

/** Why a finished run stopped short, from its notes and the first step that broke. */
export function stoppedMessage(run: Data): string {
	if (run.status === 'cancelled') {
		return `The render was cancelled${typeof run.cancelReason === 'string' ? `: ${run.cancelReason}` : ''}.`;
	}
	const nodes: Data[] = Array.isArray(run.nodes) ? run.nodes : [];
	const broken = nodes.find((node) => typeof node.error === 'string');
	const reasons = [run.statusNote, run.refusalNote, broken && `${String(broken.label ?? broken.type)}: ${String(broken.error)}`];
	return `The render stopped before it finished. ${reasons.filter((r) => typeof r === 'string' && r).join(' ')}`.trim();
}

/** A finished run as the action's result, or the error that stops the Zap. */
export function finishedResult(z: ZObject, run: Data, extra: Data, outputKey?: string): Data {
	if (run.status === 'error' || run.status === 'cancelled') {
		throw new z.errors.Error(
			`${stoppedMessage(run)} Open the pipeline in Treza to see which step stopped: https://www.trezalabs.com/platform/pipelines/${run.pipelineId}`,
			run.status === 'cancelled' ? 'RenderCancelled' : 'RenderStopped',
		);
	}
	return runItem(run, extra, outputKey);
}

// --------------------------------------------------------------- callbacks

let callbackSupport: Promise<boolean> | undefined;

/**
 * Whether Treza takes a `callbackUrl` and POSTs the finished run to it. Read
 * from the published tool schema once per process; until Treza takes it,
 * renders are waited for inside the step instead.
 */
export function supportsCallbacks(z: ZObject): Promise<boolean> {
	callbackSupport ??= (async () => {
		try {
			const response = await z.request({ method: 'GET', url: `${baseUrl()}/api/v1/tools`, skipThrowForStatus: true });
			const tools: Data[] = (response.data as Data)?.tools ?? [];
			const runPipeline = tools.find((t) => t.name === 'run_pipeline');
			return Boolean(runPipeline?.inputSchema?.properties?.callbackUrl);
		} catch {
			return false;
		}
	})();
	return callbackSupport;
}

/** For tests: forget what the schema said. */
export function resetCallbackSupport(): void {
	callbackSupport = undefined;
}

/** How long a step may wait for a render inline, inside Zapier's 30 seconds (tests shorten it). */
const inlineWaitMs = (): number => Number(process.env.TREZA_INLINE_WAIT_MS) || 20_000;

/**
 * Started a render: hand Zapier the run and let Treza's callback resume the
 * step, or, without callbacks, wait inline for what fits in the time left.
 */
export async function awaitRender(
	z: ZObject,
	bundle: Bundle,
	started: { runId: string; pipelineId: string; usedCallback: boolean; extra: Data },
	outputKey: string | undefined,
	startedAt: number,
): Promise<Data> {
	const pending = runItem({ runId: started.runId, pipelineId: started.pipelineId, status: 'running' }, started.extra);
	if (started.usedCallback) return pending;
	const deadline = startedAt + inlineWaitMs();
	for (;;) {
		const run = await callTool(z, 'get_run', { pipelineId: started.pipelineId, runId: started.runId });
		if (run.status !== 'running') return finishedResult(z, run, started.extra, outputKey);
		const wait = Math.min(Math.max(Number(run.pollAfterSec) || 3, 2), 5) * 1000;
		if (Date.now() + wait >= deadline) {
			return {
				...pending,
				note: 'Still rendering. Add a Run Finished trigger on this pipeline to continue when it is done.',
			};
		}
		await new Promise((resolve) => setTimeout(resolve, wait));
	}
}

// ----------------------------------------------------------- quoted renders

const STALE_QUOTE_CODES = ['STALE_QUOTE', 'QUOTE_MISMATCH', 'UNKNOWN_QUOTE'];

function overBudget(z: ZObject, priceUsd: number, maxCostUsd: number): Error {
	const price = Number.isFinite(priceUsd) ? `$${priceUsd.toFixed(2)}` : 'more';
	return new z.errors.Error(
		`This render costs ${price}, over the Max cost of $${maxCostUsd.toFixed(2)}. Nothing was charged. Raise Max cost, or ask for less (a shorter clip or a cheaper model).`,
		'OverBudget',
		400,
	);
}

export interface StartedRender {
	quoted: Data;
	runId: string;
	pipelineId: string;
	usedCallback: boolean;
}

/**
 * Get Treza's quote, stop if it is over Max cost or the balance doesn't cover
 * it, then start the render once at the quoted price. A quote another render
 * took first is quoted again; a price the inputs raised still runs, once, if
 * it stays under Max cost.
 */
export async function startQuoted(
	z: ZObject,
	maxCostUsd: number,
	quote: () => Promise<ToolResult>,
	inputs?: Data,
): Promise<StartedRender> {
	const callbackUrl = (await supportsCallbacks(z)) ? z.generateCallbackUrl() : undefined;
	for (let attempt = 0; ; attempt++) {
		const quotedResult = await quote();
		if (!quotedResult.ok) {
			if (quotedResult.code === 'OVER_BUDGET') throw overBudget(z, Number(quotedResult.body.estimatedChargeUsd), maxCostUsd);
			throw refusalError(z, quotedResult);
		}
		const quoted = quotedResult.data;
		const pipelineId = String(quoted.pipelineId);
		const price = Number(quoted.estimatedChargeUsd);
		if (!(price <= maxCostUsd)) throw overBudget(z, price, maxCostUsd);
		if (quoted.sufficient === false) {
			throw new z.errors.Error(
				`This render costs $${price.toFixed(2)} and your Treza balance is $${Number(quoted.balanceUsd ?? 0).toFixed(2)}. Nothing was charged. Add credits at ${quoted.topUpUrl ?? TOP_UP_URL}`,
				'InsufficientCredits',
				402,
			);
		}

		const base = compact({ pipelineId, inputs, callbackUrl });
		const run = await requestTool(z, 'run_pipeline', typeof quoted.quoteId === 'string' ? { ...base, quoteId: quoted.quoteId } : { ...base, requestId: randomUUID() });
		if (run.ok) return { quoted, runId: String(run.data.runId), pipelineId, usedCallback: Boolean(callbackUrl) };
		if (attempt < 2 && run.code && STALE_QUOTE_CODES.includes(run.code)) continue;
		if (run.code === 'PRICE_CHANGED') {
			const newPrice = Number(run.body.estimatedChargeUsd);
			if (!(newPrice <= maxCostUsd)) throw overBudget(z, newPrice, maxCostUsd);
			const again = await callTool(z, 'run_pipeline', { ...base, requestId: randomUUID() });
			return { quoted: { ...quoted, estimatedChargeUsd: newPrice }, runId: String(again.runId), pipelineId, usedCallback: Boolean(callbackUrl) };
		}
		throw refusalError(z, run);
	}
}

/** What a quote said about the render, for the result item. */
export function quoteSummary(quoted: Data): Data {
	return compact({
		estimatedChargeUsd: quoted.estimatedChargeUsd,
		model: quoted.model?.id ?? quoted.model,
		durationSec: quoted.durationSec,
		aspectRatio: quoted.aspectRatio,
	});
}

// ------------------------------------------------------------------ files

const TREZA_MEDIA = /^https:\/\/media\.trezalabs\.com\//;

/** The upload types Treza's library takes (create_upload_url). */
export const UPLOAD_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'video/mp4',
	'video/quicktime',
	'video/webm',
	'audio/mpeg',
	'audio/mp4',
	'audio/wav',
	'audio/ogg',
];

/**
 * Put a file from another Zap step into the Treza library and return its
 * library URL. Files already in the library pass straight through.
 */
export async function toLibraryUrl(z: ZObject, file: string, name?: string): Promise<string> {
	if (TREZA_MEDIA.test(file) || file.startsWith(`${baseUrl()}/files/`)) return file;
	const imported = await uploadToLibrary(z, file, name);
	return String(imported.url);
}

/** Download a file (a URL from another step) and upload it to the Treza library. */
export async function uploadToLibrary(z: ZObject, file: string, name?: string): Promise<Data> {
	const download = await z.request({ url: file, method: 'GET', raw: true, skipThrowForStatus: true });
	if (download.status >= 400) {
		throw new z.errors.Error(`The file could not be downloaded (HTTP ${download.status}). Check that the step before shares a file, not a page.`, 'FileDownload', download.status);
	}
	const contentType = String(download.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
	if (!UPLOAD_TYPES.includes(contentType)) {
		throw new z.errors.Error(
			`Treza can't take a ${contentType || 'file of unknown type'}. Supported types: ${UPLOAD_TYPES.join(', ')}.`,
			'UnsupportedFile',
			400,
		);
	}
	const body = await download.buffer();
	const target = await callTool(z, 'create_upload_url', { contentType });
	const put = await z.request({
		method: 'PUT',
		url: String(target.uploadUrl),
		body,
		headers: { 'Content-Type': contentType },
		skipThrowForStatus: true,
	});
	if (put.status >= 400) {
		throw new z.errors.Error(`The upload to Treza was refused (HTTP ${put.status}). Try the step again.`, 'UploadRefused', put.status);
	}
	const fileName = name || decodeURIComponent(new URL(file).pathname.split('/').pop() || 'file');
	return callTool(z, 'import_media', { url: String(target.mediaUrl), name: fileName });
}
