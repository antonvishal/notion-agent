import { defineHook } from "eve/hooks";

import { closeBrowserSession } from "../lib/browser-session";

async function closeBestEffort(): Promise<void> {
  await closeBrowserSession().catch((error) => {
    console.error("Could not close Browserbase session", error);
  });
}

export default defineHook({
  events: {
    "turn.completed": closeBestEffort,
    "turn.failed": closeBestEffort,
    "turn.cancelled": closeBestEffort,
  },
});
