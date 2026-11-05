import { compact, type Data } from '../treza.js';

/** Zapier sends booleans as true/false or as text ("true", "yes"). */
export const toBool = (value: unknown): boolean => value === true || /^(true|yes|1)$/i.test(String(value ?? ''));

/** A yes/no field left blank is no answer, so Treza's default applies. */
export const optionalBool = (value: unknown): boolean | undefined =>
	value === undefined || value === null || value === '' ? undefined : toBool(value);

export const toNumber = (value: unknown): number | undefined => {
	if (value === undefined || value === null || value === '') return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
};

/** What the first part of a render step knew (price, model), carried into the resumed result. */
export const renderExtra = (outputData: Data | undefined): Data =>
	compact({
		estimatedChargeUsd: outputData?.estimatedChargeUsd,
		model: outputData?.model,
		durationSec: outputData?.durationSec,
		aspectRatio: outputData?.aspectRatio,
		lengthSec: outputData?.lengthSec,
	});
