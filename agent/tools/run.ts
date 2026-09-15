import {
  CodeModeRunInputSchema,
  RUN_INPUT_SCHEMA,
  RUN_TOOL_DESCRIPTION,
} from "../lib/stagehand-facade/facade/index.mjs";
import { defineTool } from "eve/tools";

import { getFacadeTools } from "../lib/browser-session";

const MUTATING_CODE =
  /\.(?:fill|type|selectOption|setInputFiles|keyPress)\s*\(|\b(?:POST|PUT|PATCH|DELETE)\b/iu;

export default defineTool({
  description: `${RUN_TOOL_DESCRIPTION} This browser is read-and-download only.`,
  inputSchema: RUN_INPUT_SCHEMA,
  label: { start: () => "Use authenticated browser" },
  async execute(rawInput) {
    const input = CodeModeRunInputSchema.parse(rawInput);
    if (input.code && MUTATING_CODE.test(input.code)) {
      throw new Error(
        "Read-only browser policy: form entry, file input, key presses, and mutating HTTP methods are disabled.",
      );
    }
    if (
      input.actions?.some((action) =>
        ["fill", "type", "press", "select"].includes(action.op),
      )
    ) {
      throw new Error(
        "Read-only browser policy: only click and hover snapshot actions are allowed.",
      );
    }

    const tools = await getFacadeTools();
    const value =
      input.code === undefined
        ? await tools.runActions(input.actions!)
        : await tools.run(input.code);
    return stringify(value);
  },
});

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
