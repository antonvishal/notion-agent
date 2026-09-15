import { Client } from "@notionhq/client";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { resolveNotionToken } from "../lib/notion";

const propertyValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  z.object({
    start: z.string().min(1),
    end: z.string().min(1).nullable().optional(),
    timeZone: z.string().min(1).nullable().optional(),
  }),
]);

type InputValue = z.infer<typeof propertyValue>;
type PageProperty = { id: string; type: string };

export default defineTool({
  description:
    "Update database properties on the originating Notion page. This reads the page's live property schema and converts simple values to the exact Notion property types. Use it for fields/columns such as Status, Amount, billing dates, URLs, and checkboxes; use Notion markdown operations only for page body content.",
  inputSchema: z.object({
    notionPageId: z.string().min(1).describe("Originating Notion page ID"),
    properties: z
      .record(z.string().min(1), propertyValue)
      .describe("Property display names mapped to their desired values"),
  }),
  label: { start: () => "Update Notion fields" },
  async execute({ notionPageId, properties }, ctx) {
    const originatingPageId = String(
      ctx.session.auth.current?.attributes.notionPageId ?? "",
    );
    if (!originatingPageId || normalizeId(originatingPageId) !== normalizeId(notionPageId)) {
      throw new Error("Properties may only be updated on the originating Notion page.");
    }

    const notion = new Client({ auth: await resolveNotionToken() });
    const page = await notion.pages.retrieve({ page_id: notionPageId });
    if (!("properties" in page)) {
      throw new Error("The originating Notion page does not expose database properties.");
    }

    const schema = page.properties as Record<string, PageProperty>;
    const updates: Record<string, unknown> = {};
    const changed: Array<{ name: string; id: string; type: string }> = [];

    for (const [requestedName, value] of Object.entries(properties)) {
      const match = findProperty(schema, requestedName);
      if (!match) {
        throw new Error(
          `Property ${JSON.stringify(requestedName)} was not found. Available properties: ${Object.keys(schema).join(", ")}`,
        );
      }

      const [name, property] = match;
      updates[property.id] = toNotionValue(name, property.type, value);
      changed.push({ name, id: property.id, type: property.type });
    }

    if (changed.length === 0) throw new Error("At least one property update is required.");

    await notion.pages.update({
      page_id: notionPageId,
      properties: updates,
    } as Parameters<typeof notion.pages.update>[0]);

    return { updated: changed };
  },
});

function findProperty(
  schema: Record<string, PageProperty>,
  requestedName: string,
): [string, PageProperty] | undefined {
  if (schema[requestedName]) return [requestedName, schema[requestedName]];
  const normalized = requestedName.trim().toLocaleLowerCase();
  return Object.entries(schema).find(
    ([name]) => name.trim().toLocaleLowerCase() === normalized,
  );
}

function toNotionValue(name: string, type: string, value: InputValue): unknown {
  switch (type) {
    case "title":
    case "rich_text":
      return { [type]: richText(asText(value)) };
    case "number":
      return { number: value === null ? null : asNumber(name, value) };
    case "status":
      return { status: value === null ? null : { name: asText(value) } };
    case "select":
      return { select: value === null ? null : { name: asText(value) } };
    case "multi_select":
      return {
        multi_select: asStringArray(name, value).map((option) => ({ name: option })),
      };
    case "files":
      return {
        files: asStringArray(name, value).map((url, index) => ({
          name: filenameFromUrl(url, index),
          type: "external" as const,
          external: { url: asHttpUrl(name, url) },
        })),
      };
    case "date":
      return { date: value === null ? null : asDate(name, value) };
    case "url":
    case "email":
    case "phone_number":
      return { [type]: value === null ? null : asText(value) };
    case "checkbox":
      if (typeof value !== "boolean") {
        throw new Error(`Property ${JSON.stringify(name)} requires a boolean.`);
      }
      return { checkbox: value };
    default:
      throw new Error(
        `Property ${JSON.stringify(name)} has unsupported type ${JSON.stringify(type)}.`,
      );
  }
}

function richText(content: string) {
  return content ? [{ type: "text" as const, text: { content } }] : [];
}

function asText(value: InputValue): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  throw new Error("This property requires a string or number value.");
}

function asNumber(name: string, value: InputValue): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Property ${JSON.stringify(name)} requires a numeric value.`);
}

function asStringArray(name: string, value: InputValue): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  throw new Error(`Property ${JSON.stringify(name)} requires text or a text array.`);
}

function asDate(name: string, value: InputValue) {
  if (typeof value === "string") return { start: value };
  if (value && typeof value === "object" && !Array.isArray(value) && "start" in value) {
    return {
      start: value.start,
      ...(value.end ? { end: value.end } : {}),
      ...(value.timeZone ? { time_zone: value.timeZone } : {}),
    };
  }
  throw new Error(`Property ${JSON.stringify(name)} requires an ISO date or date range.`);
}

function asHttpUrl(name: string, value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    // Fall through to the property-specific error.
  }
  throw new Error(`Property ${JSON.stringify(name)} requires an HTTP(S) URL.`);
}

function filenameFromUrl(value: string, index: number): string {
  try {
    const basename = new URL(value).pathname.split("/").filter(Boolean).pop();
    if (basename) return decodeURIComponent(basename).slice(0, 180);
  } catch {
    // URL validation reports the useful error after this helper returns.
  }
  return `attachment-${index + 1}`;
}

function normalizeId(value: string): string {
  return value.replaceAll("-", "").toLocaleLowerCase();
}
