import { defineTool } from "eve/tools";
import { z } from "zod";

import { browserSessionId, closeBrowserSession } from "../lib/browser-session";
import { attachSessionPdfs } from "../lib/notion-files";

export default defineTool({
  description:
    "Attach up to three PDFs downloaded in the current Browserbase session to the originating Notion page and its empty Files & media property, then close the browser. If a download did not complete, pass the stable invoice or document URL as sourceFileUrl so the files property still receives a link. Call this exactly once after browsing.",
  inputSchema: z.object({
    notionPageId: z.string().min(1).describe("Originating Notion page ID from the command"),
    sourceFileUrl: z.string().url().optional().describe("Stable invoice or document URL fallback"),
    sourceFileName: z.string().min(1).optional().describe("Display name for the fallback URL"),
  }),
  label: { start: () => "Attach downloads and close browser" },
  async execute({ notionPageId, sourceFileUrl, sourceFileName }, ctx) {
    const originatingPageId = String(
      ctx.session.auth.current?.attributes.notionPageId ?? "",
    ).replaceAll("-", "").toLocaleLowerCase();
    if (
      !originatingPageId ||
      originatingPageId !== notionPageId.replaceAll("-", "").toLocaleLowerCase()
    ) {
      throw new Error("Downloads may only be attached to the originating Notion page.");
    }

    const sessionId = browserSessionId.get();
    if (!sessionId) return { sessionClosed: true, attachedPdfs: [] };

    try {
      const attachment = await attachSessionPdfs(
        sessionId,
        notionPageId,
        sourceFileUrl ? { url: sourceFileUrl, name: sourceFileName } : undefined,
      );
      return { sessionClosed: true, ...attachment };
    } finally {
      await closeBrowserSession();
    }
  },
});
