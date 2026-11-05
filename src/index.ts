import zapier, { defineApp } from 'zapier-platform-core';

import packageJson from '../package.json' with { type: 'json' };

import authentication from './authentication.js';
import assembleVideo from './creates/assembleVideo.js';
import generateImage from './creates/generateImage.js';
import generateVideo from './creates/generateVideo.js';
import runPipeline from './creates/runPipeline.js';
import uploadFile from './creates/uploadFile.js';
import { afters, befores } from './middleware.js';
import findRun from './searches/findRun.js';
import { imageModelList, pipelineList, runList, videoModelList } from './triggers/lists.js';
import runFinished from './triggers/runFinished.js';

export default defineApp({
	version: packageJson.version,
	platformVersion: zapier.version,

	authentication,
	beforeRequest: [...befores],
	afterResponse: [...afters],

	triggers: {
		[runFinished.key]: runFinished,
		[pipelineList.key]: pipelineList,
		[videoModelList.key]: videoModelList,
		[imageModelList.key]: imageModelList,
		[runList.key]: runList,
	},

	creates: {
		[generateVideo.key]: generateVideo,
		[generateImage.key]: generateImage,
		[runPipeline.key]: runPipeline,
		[assembleVideo.key]: assembleVideo,
		[uploadFile.key]: uploadFile,
	},

	searches: {
		[findRun.key]: findRun,
	},
});
