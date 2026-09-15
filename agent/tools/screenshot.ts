import {
  SCREENSHOT_INPUT_SCHEMA,
  SCREENSHOT_TOOL_DESCRIPTION,
  ScreenshotInputSchema,
} from "../lib/stagehand-facade/facade/index.mjs";
import { defineTool } from "eve/tools";

import { getFacadeTools } from "../lib/browser-session";

export default defineTool({
  description: SCREENSHOT_TOOL_DESCRIPTION,
  inputSchema: SCREENSHOT_INPUT_SCHEMA,
  label: { start: () => "Capture browser screenshot" },
  async execute(rawInput) {
    return (await getFacadeTools()).screenshot(ScreenshotInputSchema.parse(rawInput));
  },
  toModelOutput({ data, mimeType }) {
    return {
      type: "content" as const,
      value: [
        { type: "text" as const, text: "Screenshot captured." },
        { type: "file" as const, data: { type: "data" as const, data }, mediaType: mimeType },
      ],
    };
  },
});
