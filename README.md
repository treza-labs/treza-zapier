# treza-zapier

The [Zapier](https://zapier.com) integration for [Treza](https://www.trezalabs.com). It lets any Zap generate videos and images, run your Treza pipelines and assemble finished cuts, all from the AI video and image models Treza connects (Veo, Seedance, Kling, Gemini, FLUX and more).

Built with the [Zapier Platform CLI](https://docs.zapier.com/integrations/build-cli/overview) in TypeScript. Calls go to Treza's REST API, `POST https://www.trezalabs.com/api/v1/tools/<name>`, with the same tools, permissions and refusals as Treza's MCP server and the [n8n node](https://github.com/treza-labs/n8n-nodes-treza).

## What it does

| Kind | Name | What it does |
|---|---|---|
| Trigger | **Run Finished** | Fires when a run of a pipeline finishes. You pick which endings count: succeeded, failed, partly finished or cancelled. |
| Action | **Generate Video** | Generates a clip from a prompt. You choose the shape, length and model, and can open on or end on a picture or continue a clip. |
| Action | **Generate Image** | Generates a picture from a prompt, or restyles up to 4 reference pictures. |
| Action | **Run Pipeline** | Runs one of your pipelines, with a field for each of its input steps (text, JSON or a file). |
| Action | **Assemble Video** | Joins clips and pictures into one video, with music (from a file or composed from a prompt), narration, captions, transitions and motion on stills. |
| Action | **Upload File** | Puts a picture, video or audio file from another app into your Treza library. |
| Search | **Find Run** | Finds a run of a pipeline, with its status and finished files. |

Files from other apps (frames, reference pictures, clips, music) are uploaded to the Treza library before Treza uses them.

## Spending and safety

- **Max cost** is required on Generate Video, Generate Image and Run Pipeline. The step gets Treza's quote first, and it stops before anything is charged if the price is higher or the balance doesn't cover it. The render then starts at the quoted price, once.
- If someone else's render took the quote first, the step quotes again. If the pipeline's inputs raise the price but it stays under Max cost, it still runs once.

## Long renders

Zapier gives each step 30 seconds, and video takes minutes. Renders use Zapier's [callback URL](https://docs.zapier.com/integrations/build-cli/core): the step starts the render and shows as waiting, and Treza posts the finished run to the callback, which resumes the Zap with the file.

The integration reads Treza's published tool schema (`GET /api/v1/tools`) and uses callbacks as soon as `run_pipeline` takes a `callbackUrl`. Until then, a step waits up to 20 seconds inline, which is enough for most images. A render still going after that returns `status: running` with its Run ID, and a **Run Finished** trigger picks it up when it is done.

## Development

```bash
npm install --ignore-scripts
npm test                         # typecheck, build, and every trigger and action against a mock Treza API
npx zapier-platform validate     # Zapier's schema and style checks (style checks need a login)
```

The tests run each trigger, action and search through Zapier's app tester against `test/mock-treza.ts`, an in-process stand-in for Treza's API. They cover callbacks on and off, price caps, stale quotes, raised prices, file uploads (the API key never goes to file or upload URLs), the trigger's status filter and Find Run.

To release: `npx zapier-platform push`. This needs `zapier-platform login`, or `ZAPIER_DEPLOY_KEY` in the environment.

## License

[MIT](LICENSE.md)
