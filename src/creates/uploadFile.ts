import { defineCreate, defineInputFields, type CreatePerform } from 'zapier-platform-core';

import { uploadToLibrary } from '../treza.js';

const inputFields = defineInputFields([
	{ key: 'file', label: 'File', type: 'file', required: true, helpText: 'A picture, video or audio file from an earlier step.' },
	{ key: 'name', label: 'Name', required: false, helpText: 'What to call it in your library. Defaults to the file name.' },
]);

const perform = (async (z, bundle) => {
	const imported = await uploadToLibrary(z, String(bundle.inputData.file), bundle.inputData.name ? String(bundle.inputData.name) : undefined);
	return { id: imported.url, url: imported.url, kind: imported.kind, name: imported.name, bytes: imported.bytes };
}) satisfies CreatePerform<typeof inputFields>;

export default defineCreate({
	key: 'upload_file',
	noun: 'File',
	display: {
		label: 'Upload File',
		description: 'Uploads a picture, video or audio file to your Treza library.',
	},
	operation: {
		inputFields,
		perform,
		sample: {
			id: 'https://media.trezalabs.com/api/media/uploads/acct/logo.png',
			url: 'https://media.trezalabs.com/api/media/uploads/acct/logo.png',
			kind: 'image',
			name: 'logo.png',
			bytes: 48213,
		},
		outputFields: [
			{ key: 'url', label: 'File URL' },
			{ key: 'kind', label: 'Kind' },
			{ key: 'name', label: 'Name' },
			{ key: 'bytes', label: 'Size (bytes)', type: 'integer' },
		],
	},
});
