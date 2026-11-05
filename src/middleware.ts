import type { BeforeRequestMiddleware } from 'zapier-platform-core';

import { USER_AGENT, baseUrl } from './treza.js';

/**
 * Sign requests to Treza's API with the connection's key. Nothing else gets
 * it: file downloads from other steps and the signed upload URL go out bare.
 */
const includeApiKey: BeforeRequestMiddleware = (request, _z, bundle) => {
	if (request.url.startsWith(`${baseUrl()}/api/`)) {
		request.headers = {
			...request.headers,
			Authorization: `Bearer ${bundle.authData.apiKey}`,
			// Lowercase, to replace the 'user-agent: Zapier' every request starts with.
			'user-agent': USER_AGENT,
		};
	}
	return request;
};

export const befores = [includeApiKey];

export const afters = [];
