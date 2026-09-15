import { createNotionAdapter, type NotionRawMessage } from "@chat-adapter/notion";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import type { Message, Thread } from "chat";
import { chatSdkChannel } from "eve/channels/chat-sdk";

import { resolveNotionToken } from "../lib/notion";

const allowedUserIds = new Set(
  (process.env.NOTION_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const notion = createNotionAdapter({
  token: resolveNotionToken,
  verificationToken: process.env.NOTION_VERIFICATION_TOKEN,
  // `/run` is routed below as a message pattern, not as a synthetic mention.
  mentionMode: "mention",
  userName: "notion-agent",
});

const state = process.env.REDIS_URL
  ? createRedisState({ url: process.env.REDIS_URL, keyPrefix: "notion-agent" })
  : createMemoryState();

if (process.env.VERCEL_ENV === "production" && !process.env.REDIS_URL) {
  throw new Error("REDIS_URL is required in production.");
}

export const { bot, channel, send } = chatSdkChannel({
  userName: "notion-agent",
  adapters: { notion },
  state,
  streaming: false,
  turnPolicy: "queue",
});

bot.onNewMessage(/^\/run(?:\s|$)/i, async (thread: Thread, message: Message) => {
  const command = message.text.trim();
  if (message.author.isMe || message.author.isBot === true || message.author.isSystem) return;

  console.info("Received Notion /run command", {
    commentId: message.id,
    userId: message.author.userId,
  });

  if (allowedUserIds.size === 0) {
    console.error("NOTION_ALLOWED_USER_IDS is not configured", {
      userId: message.author.userId,
    });
    await thread.post(
      `The /run allowlist is not configured. Your Notion user ID is \`${message.author.userId}\`; add it to NOTION_ALLOWED_USER_IDS and redeploy.`,
    );
    return;
  }

  if (!allowedUserIds.has(message.author.userId)) {
    console.warn("Rejected /run from non-allowlisted Notion user", {
      userId: message.author.userId,
    });
    await thread.post("This Notion user is not allowed to run browser commands.");
    return;
  }

  const raw = message.raw as NotionRawMessage;
  const page = await message.subject;
  const parent = raw.comment.parent;
  const blockId = parent.type === "block_id" ? parent.block_id : undefined;
  const instruction = command.replace(/^\/run\b/i, "").trim();

  if (!instruction) {
    await thread.post("Add an instruction after `/run`.");
    return;
  }

  const prompt = [
    "A trusted user submitted a /run command from a Notion comment.",
    `Notion page ID: ${raw.pageId}`,
    `Notion page title: ${page?.title ?? "Untitled"}`,
    `Notion page URL: ${page?.url ?? "Unavailable"}`,
    `Notion comment ID: ${raw.comment.id}`,
    `Notion discussion ID: ${raw.comment.discussion_id}`,
    `Notion block ID: ${blockId ?? "page-level comment"}`,
    `Requested task: ${instruction}`,
    "Follow the Notion page command workflow in your instructions. Reply with a short completion or failure summary.",
  ].join("\n");

  await send(prompt, {
    thread,
    title: `/run on ${page?.title ?? "Notion page"}`,
    turnPolicy: "queue",
    auth: {
      authenticator: "notion",
      principalType: "user",
      principalId: message.author.userId,
      attributes: {
        notionPageId: raw.pageId,
        notionCommentId: raw.comment.id,
        notionDiscussionId: raw.comment.discussion_id,
      },
    },
  });
});

export default channel;
