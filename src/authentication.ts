import type { Authentication, Bundle, ZObject } from 'zapier-platform-core';

import { callTool } from './treza.js';

/** The key works if Treza says whose account it opens. */
const test = (z: ZObject, _bundle: Bundle) => callTool(z, 'get_profile');

export default {
	type: 'custom',
	fields: [
		{
			key: 'apiKey',
			label: 'API Key',
			type: 'password',
			required: true,
			helpText:
				'Create a key in Treza under [Settings → API keys](https://www.trezalabs.com/platform/api-keys) with the pipelines:read, pipelines:write and pipelines:run permissions. It starts with `treza_live_`.',
		},
	],
	test,
	connectionLabel: '{{email}}',
} satisfies Authentication;
