import { z } from "zod/v4";
import { BrowserbaseLaunchOptions, LocalBrowserLaunchOptions, Stagehand, StagehandClientCreateConfig } from "@browserbasehq/stagehand";

//#region src/facade/contract.d.ts
declare const RUN_TOOL_DESCRIPTION = "Browse and automate websites in the persistent Stagehand browser. Navigate with JavaScript such as await page.goto(\"https://example.com\"); there is no separate navigate or start tool. Execute either a JavaScript workflow against the Stagehand Playwright facade or a batch of actions using IDs from the latest snapshot. Provide exactly one of code or actions. Each action must use \"op\" (never \"kind\") and \"id\" (never \"ref\"). Copy the bracketed snapshot ID as a string. Examples: {\"actions\":[{\"op\":\"click\",\"id\":\"1-42\"}]}, {\"actions\":[{\"op\":\"fill\",\"id\":\"2-14\",\"value\":\"Miami\"}]}, {\"actions\":[{\"op\":\"select\",\"id\":\"3-9\",\"values\":\"Lowest price\"}]}.";
declare const SNAPSHOT_TOOL_DESCRIPTION = "Capture the active page's Stagehand accessibility tree and hydrate its displayed IDs for subsequent run actions. Every call replaces the active page's ID map.";
declare const SCREENSHOT_TOOL_DESCRIPTION = "Capture a screenshot of the active page. For size-constrained MCP clients, prefer a viewport JPEG: {\"type\":\"jpeg\",\"quality\":40,\"fullPage\":false}.";
declare const RUN_INPUT_SCHEMA: {
  readonly type: "object";
  readonly properties: {
    readonly code: {
      readonly type: "string";
      readonly minLength: 1;
    };
    readonly actions: {
      readonly type: "array";
      readonly description: "Snapshot actions with the exact fields \"op\" and \"id\". Do not use \"kind\" or \"ref\".";
      readonly items: {
        readonly oneOf: readonly [{
          type: string;
          properties: {
            op: {
              const: string;
              description: string;
            };
            id: {
              type: string;
              description: string;
            };
          };
          required: string[];
          additionalProperties: boolean;
        }, {
          type: string;
          properties: {
            op: {
              const: string;
              description: string;
            };
            id: {
              type: string;
              description: string;
            };
          };
          required: string[];
          additionalProperties: boolean;
        }, {
          type: string;
          properties: {
            op: {
              const: string;
              description: string;
            };
            id: {
              type: string;
              description: string;
            };
          };
          required: string[];
          additionalProperties: boolean;
        }, {
          type: string;
          properties: {
            op: {
              const: string;
              description: string;
            };
            id: {
              type: string;
              description: string;
            };
          };
          required: string[];
          additionalProperties: boolean;
        }, {
          type: string;
          properties: {
            op: {
              const: string;
              description: string;
            };
            id: {
              type: string;
              description: string;
            };
          };
          required: string[];
          additionalProperties: boolean;
        }, {
          type: string;
          properties: {
            op: {
              const: string;
              description: string;
            };
            id: {
              type: string;
              description: string;
            };
          };
          required: string[];
          additionalProperties: boolean;
        }];
      };
      readonly minItems: 1;
    };
  };
  readonly additionalProperties: false;
};
declare const SNAPSHOT_INPUT_SCHEMA: {
  readonly type: "object";
  readonly properties: {
    readonly includeIframes: {
      readonly type: "boolean";
      readonly default: true;
    };
  };
  readonly additionalProperties: false;
};
declare const SCREENSHOT_INPUT_SCHEMA: {
  readonly type: "object";
  readonly properties: {
    readonly fullPage: {
      readonly type: "boolean";
    };
    readonly type: {
      readonly type: "string";
      readonly enum: readonly ["png", "jpeg"];
    };
    readonly quality: {
      readonly type: "number";
      readonly minimum: 0;
      readonly maximum: 100;
    };
  };
  readonly additionalProperties: false;
};
declare const FACADE_TOOLS: readonly [{
  readonly name: "run";
  readonly description: "Browse and automate websites in the persistent Stagehand browser. Navigate with JavaScript such as await page.goto(\"https://example.com\"); there is no separate navigate or start tool. Execute either a JavaScript workflow against the Stagehand Playwright facade or a batch of actions using IDs from the latest snapshot. Provide exactly one of code or actions. Each action must use \"op\" (never \"kind\") and \"id\" (never \"ref\"). Copy the bracketed snapshot ID as a string. Examples: {\"actions\":[{\"op\":\"click\",\"id\":\"1-42\"}]}, {\"actions\":[{\"op\":\"fill\",\"id\":\"2-14\",\"value\":\"Miami\"}]}, {\"actions\":[{\"op\":\"select\",\"id\":\"3-9\",\"values\":\"Lowest price\"}]}.";
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: {
      readonly code: {
        readonly type: "string";
        readonly minLength: 1;
      };
      readonly actions: {
        readonly type: "array";
        readonly description: "Snapshot actions with the exact fields \"op\" and \"id\". Do not use \"kind\" or \"ref\".";
        readonly items: {
          readonly oneOf: readonly [{
            type: string;
            properties: {
              op: {
                const: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
            };
            required: string[];
            additionalProperties: boolean;
          }, {
            type: string;
            properties: {
              op: {
                const: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
            };
            required: string[];
            additionalProperties: boolean;
          }, {
            type: string;
            properties: {
              op: {
                const: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
            };
            required: string[];
            additionalProperties: boolean;
          }, {
            type: string;
            properties: {
              op: {
                const: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
            };
            required: string[];
            additionalProperties: boolean;
          }, {
            type: string;
            properties: {
              op: {
                const: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
            };
            required: string[];
            additionalProperties: boolean;
          }, {
            type: string;
            properties: {
              op: {
                const: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
            };
            required: string[];
            additionalProperties: boolean;
          }];
        };
        readonly minItems: 1;
      };
    };
    readonly additionalProperties: false;
  };
}, {
  readonly name: "snapshot";
  readonly description: "Capture the active page's Stagehand accessibility tree and hydrate its displayed IDs for subsequent run actions. Every call replaces the active page's ID map.";
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: {
      readonly includeIframes: {
        readonly type: "boolean";
        readonly default: true;
      };
    };
    readonly additionalProperties: false;
  };
}, {
  readonly name: "screenshot";
  readonly description: "Capture a screenshot of the active page. For size-constrained MCP clients, prefer a viewport JPEG: {\"type\":\"jpeg\",\"quality\":40,\"fullPage\":false}.";
  readonly inputSchema: {
    readonly type: "object";
    readonly properties: {
      readonly fullPage: {
        readonly type: "boolean";
      };
      readonly type: {
        readonly type: "string";
        readonly enum: readonly ["png", "jpeg"];
      };
      readonly quality: {
        readonly type: "number";
        readonly minimum: 0;
        readonly maximum: 100;
      };
    };
    readonly additionalProperties: false;
  };
}];
/**
 * Canonical agent system prompt for the facade tool surface. Host examples
 * (Eve, Vercel AI SDK, deepagents) should use this text rather than authoring
 * their own so agent guidance stays identical across frameworks.
 */
declare const FACADE_AGENT_INSTRUCTIONS = "You control one persistent browser through exactly three tools:\n- snapshot: inspect the active page and hydrate bracketed element IDs.\n- run: provide either snapshot actions or JavaScript using the Playwright-shaped page API.\n- screenshot: inspect the rendered page visually.\n\nUse snapshot actions for simple interactions and run code for multi-step workflows. Pass run exactly one of code or actions; every action uses \"op\" and \"id\", never \"kind\" or \"ref\". Snapshot IDs are valid only for the latest snapshot of the active page; snapshot again after navigation or stale IDs. Do not launch another browser.";
declare const NO_HYDRATED_SNAPSHOT_ERROR = "No hydrated snapshot exists for the active page; call snapshot first.";
declare const NAVIGATED_SNAPSHOT_ERROR = "The active page navigated after its snapshot; call snapshot again.";
declare const STALE_SNAPSHOT_ID_ERROR = "Snapshot ID \"${id}\" is stale or not actionable; call snapshot again.";
declare function staleSnapshotIdError(id: string): string;
declare const RefActionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  op: z.ZodLiteral<"click">;
  id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
  op: z.ZodLiteral<"hover">;
  id: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
  op: z.ZodLiteral<"fill">;
  id: z.ZodString;
  value: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
  op: z.ZodLiteral<"type">;
  id: z.ZodString;
  text: z.ZodString;
  delay: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>, z.ZodObject<{
  op: z.ZodLiteral<"press">;
  id: z.ZodString;
  key: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
  op: z.ZodLiteral<"select">;
  id: z.ZodString;
  values: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>;
}, z.core.$strict>], "op">;
declare const CodeModeRunInputSchema: z.ZodObject<{
  code: z.ZodOptional<z.ZodString>;
  actions: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    op: z.ZodLiteral<"click">;
    id: z.ZodString;
  }, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"hover">;
    id: z.ZodString;
  }, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"fill">;
    id: z.ZodString;
    value: z.ZodString;
  }, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"type">;
    id: z.ZodString;
    text: z.ZodString;
    delay: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"press">;
    id: z.ZodString;
    key: z.ZodString;
  }, z.core.$strict>, z.ZodObject<{
    op: z.ZodLiteral<"select">;
    id: z.ZodString;
    values: z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>;
  }, z.core.$strict>], "op">>>;
}, z.core.$strict>;
declare const SnapshotInputSchema: z.ZodObject<{
  includeIframes: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
declare const ScreenshotInputSchema: z.ZodObject<{
  fullPage: z.ZodOptional<z.ZodBoolean>;
  type: z.ZodOptional<z.ZodEnum<{
    png: "png";
    jpeg: "jpeg";
  }>>;
  quality: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
type RefAction = z.infer<typeof RefActionSchema>;
type CodeModeRunInput = z.infer<typeof CodeModeRunInputSchema>;
//#endregion
//#region src/facade/tools.d.ts
type StagehandFacadeScreenshot = {
  data: string;
  mimeType: "image/png" | "image/jpeg";
};
declare class StagehandFacadeTools {
  private readonly stagehand;
  private readonly snapshotsByPage;
  private queue;
  constructor(stagehand: Stagehand);
  snapshot(options?: {
    includeIframes?: boolean;
  }): Promise<string>;
  screenshot(options?: {
    fullPage?: boolean;
    type?: "png" | "jpeg";
    quality?: number;
  }): Promise<StagehandFacadeScreenshot>;
  runActions(actions: RefAction[]): Promise<{
    completed: number;
    url: string;
  }>;
  run(code: string): Promise<unknown>;
  private snapshotNow;
  private screenshotNow;
  private runActionsNow;
  private runNow;
  private activePage;
  private enqueue;
}
//#endregion
//#region src/facade/config.d.ts
declare class StagehandFacadeConfigError extends Error {
  readonly name = "StagehandFacadeConfigError";
}
type StagehandFacadeConfig = {
  browser: {
    type: "local";
    launchOptions: LocalBrowserLaunchOptions;
  } | {
    type: "browserbase";
    launchOptions: BrowserbaseLaunchOptions;
  };
  stagehand: StagehandClientCreateConfig;
};
declare function stagehandFacadeConfigFromEnv(env?: NodeJS.ProcessEnv): StagehandFacadeConfig;
//#endregion
export { type CodeModeRunInput, CodeModeRunInputSchema, FACADE_AGENT_INSTRUCTIONS, FACADE_TOOLS, NAVIGATED_SNAPSHOT_ERROR, NO_HYDRATED_SNAPSHOT_ERROR, RUN_INPUT_SCHEMA, RUN_TOOL_DESCRIPTION, type RefAction, RefActionSchema, SCREENSHOT_INPUT_SCHEMA, SCREENSHOT_TOOL_DESCRIPTION, SNAPSHOT_INPUT_SCHEMA, SNAPSHOT_TOOL_DESCRIPTION, STALE_SNAPSHOT_ID_ERROR, ScreenshotInputSchema, SnapshotInputSchema, type StagehandFacadeConfig, StagehandFacadeConfigError, StagehandFacadeTools, stagehandFacadeConfigFromEnv, staleSnapshotIdError };
//# sourceMappingURL=index.d.mts.map

