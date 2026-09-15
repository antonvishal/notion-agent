import Browserbase from "@browserbasehq/sdk";
import {
  Stagehand,
  browserbase,
  type StagehandBrowser,
} from "@browserbasehq/stagehand";
import { defineState } from "eve/context";

import stagehandExtensionArchive from "../assets/stagehand-extension.zip";
import { StagehandFacadeTools } from "./stagehand-facade/facade/index.mjs";

type Resources = {
  browser: StagehandBrowser;
  stagehand: Stagehand;
  tools: StagehandFacadeTools;
};

export const browserSessionId = defineState<string | null>(
  "notion-agent.browser-session-id",
  () => null,
);

export const browserExtensionId = defineState<string | null>(
  "notion-agent.browser-extension-id",
  () => null,
);

let resources: Resources | undefined;
let resourcesPromise: Promise<Resources> | undefined;

function required(name: "BROWSERBASE_API_KEY" | "BROWSERBASE_CONTEXT_ID"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function browserbaseClient(): Browserbase {
  return new Browserbase({ apiKey: required("BROWSERBASE_API_KEY") });
}

export async function getFacadeTools(): Promise<StagehandFacadeTools> {
  resourcesPromise ??= createResources();
  try {
    resources = await resourcesPromise;
    return resources.tools;
  } catch (error) {
    resourcesPromise = undefined;
    throw error;
  }
}

export async function closeBrowserSession(): Promise<void> {
  const sessionId = browserSessionId.get();
  const extensionId = browserExtensionId.get();
  browserSessionId.update(() => null);
  browserExtensionId.update(() => null);

  const current = resources ?? (await resourcesPromise?.catch(() => undefined));
  resources = undefined;
  resourcesPromise = undefined;
  await current?.stagehand.close().catch(() => undefined);
  await current?.browser.close().catch(() => undefined);

  const client = browserbaseClient();
  if (sessionId) {
    await client.sessions
      .update(sessionId, { status: "REQUEST_RELEASE" })
      .catch(() => undefined);
  }
  if (extensionId) {
    await client.extensions.delete(extensionId).catch(() => undefined);
  }
}

async function createResources(): Promise<Resources> {
  const savedSessionId = browserSessionId.get();
  if (savedSessionId) {
    return attach(
      await browserbase.connect({
        apiKey: required("BROWSERBASE_API_KEY"),
        sessionId: savedSessionId,
      }),
    );
  }

  const client = browserbaseClient();
  const extensionId = await uploadStagehandExtension(client);
  let browser: StagehandBrowser | undefined;

  try {
    browser = await browserbase.launch({
      apiKey: required("BROWSERBASE_API_KEY"),
      keepAlive: true,
      api_timeout: 900,
      extensionId,
      browserSettings: {
        context: {
          id: required("BROWSERBASE_CONTEXT_ID"),
          persist: true,
        },
      },
    });

    if (!browser.sessionId) {
      throw new Error("Browserbase did not return a session ID.");
    }
    browserSessionId.update(() => browser!.sessionId!);
    browserExtensionId.update(() => extensionId);
    return await attach(browser);
  } catch (error) {
    await browser?.close().catch(() => undefined);
    await client.extensions.delete(extensionId).catch(() => undefined);
    throw error;
  }
}

async function attach(browser: StagehandBrowser): Promise<Resources> {
  try {
    const stagehand = await Stagehand.create({
      browser,
      cache: false,
      logging: { level: "off" },
    });
    const context = stagehand.browser.context;
    if (!(await context.activePage())) await context.newPage();
    return { browser, stagehand, tools: new StagehandFacadeTools(stagehand) };
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }
}

async function uploadStagehandExtension(client: Browserbase): Promise<string> {
  const match = /^data:[^;,]+;base64,(.+)$/u.exec(stagehandExtensionArchive);
  if (!match) {
    throw new Error("The bundled Stagehand extension is not a base64 data URL.");
  }

  const uploaded = await client.extensions.create({
    file: new File(
      [Buffer.from(match[1], "base64")],
      "stagehand-extension.zip",
      { type: "application/zip" },
    ),
  });
  if (!uploaded.id?.trim()) {
    throw new Error("Browserbase returned an empty Stagehand extension ID.");
  }
  return uploaded.id;
}

