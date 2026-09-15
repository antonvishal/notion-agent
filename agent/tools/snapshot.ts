import {
  SNAPSHOT_INPUT_SCHEMA,
  SNAPSHOT_TOOL_DESCRIPTION,
  SnapshotInputSchema,
} from "../lib/stagehand-facade/facade/index.mjs";
import { defineTool } from "eve/tools";

import { getFacadeTools } from "../lib/browser-session";

export default defineTool({
  description: SNAPSHOT_TOOL_DESCRIPTION,
  inputSchema: SNAPSHOT_INPUT_SCHEMA,
  label: { start: () => "Inspect browser page" },
  async execute(rawInput) {
    return (await getFacadeTools()).snapshot(SnapshotInputSchema.parse(rawInput));
  },
});
