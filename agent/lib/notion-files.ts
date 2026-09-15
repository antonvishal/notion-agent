import { Client } from "@notionhq/client";
import { del, put } from "@vercel/blob";
import { unzipSync } from "fflate";

import { browserbaseClient } from "./browser-session";
import { resolveNotionToken } from "./notion";

const SINGLE_PART_LIMIT = 20 * 1024 * 1024;
const MAX_PDFS = 3;

type DownloadedPdf = { name: string; bytes: Uint8Array };
type UploadedPdf = { name: string; fileUploadId: string; blobUrl?: string };

export async function attachSessionPdfs(
  sessionId: string,
  pageId: string,
  sourceFile?: { url: string; name?: string },
): Promise<{
  downloadError?: string;
  filesProperty?: string;
  pdfs: Array<{ name: string; size: number }>;
  usedSourceUrl: boolean;
}> {
  let pdfs: DownloadedPdf[] = [];
  let downloadError: string | undefined;
  try {
    pdfs = await downloadPdfs(sessionId);
  } catch (error) {
    if (!sourceFile) throw error;
    downloadError = error instanceof Error ? error.message : String(error);
  }
  const notion = new Client({ auth: await resolveNotionToken() });
  const uploaded: UploadedPdf[] = [];
  try {
    for (const pdf of pdfs) uploaded.push(await uploadPdf(notion, pdf));

    if (uploaded.length > 0) {
      await notion.blocks.children.append({
        block_id: pageId,
        children: uploaded.map(({ name, fileUploadId }) => ({
          object: "block" as const,
          type: "pdf" as const,
          pdf: {
            type: "file_upload" as const,
            file_upload: { id: fileUploadId },
            caption: [{ type: "text" as const, text: { content: name } }],
          },
        })),
      });
    }

    const property = await findEmptyFilesProperty(notion, pageId);
    const files = uploaded.length
      ? uploaded.map(({ name, fileUploadId }) => ({
          name,
          type: "file_upload" as const,
          file_upload: { id: fileUploadId },
        }))
      : sourceFile
        ? [{
            name: sourceFile.name?.trim() || filenameFromUrl(sourceFile.url),
            type: "external" as const,
            external: { url: validateHttpUrl(sourceFile.url) },
          }]
        : [];

    if (property && files.length > 0) {
      await notion.pages.update({
        page_id: pageId,
        properties: { [property.id]: { files } },
      } as Parameters<typeof notion.pages.update>[0]);
    }

    return {
      ...(downloadError ? { downloadError } : {}),
      filesProperty: property?.name,
      pdfs: pdfs.map(({ name, bytes }) => ({ name, size: bytes.byteLength })),
      usedSourceUrl: uploaded.length === 0 && Boolean(property && sourceFile),
    };
  } finally {
    const blobUrls = uploaded.flatMap(({ blobUrl }) => (blobUrl ? [blobUrl] : []));
    if (blobUrls.length) {
      await del(blobUrls, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    }
  }
}

async function findEmptyFilesProperty(
  notion: Client,
  pageId: string,
): Promise<{ id: string; name: string } | undefined> {
  const page = await notion.pages.retrieve({ page_id: pageId });
  if (!("properties" in page)) return undefined;

  const candidates = Object.entries(page.properties)
    .filter(([, property]) => property.type === "files" && property.files.length === 0)
    .map(([name, property]) => ({ id: property.id, name }));
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  return candidates.find(({ name }) => /pdf|invoice|attachment|file|document/iu.test(name));
}

function validateHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The source file URL must use HTTP or HTTPS.");
  }
  return url.href;
}

function filenameFromUrl(value: string): string {
  const basename = new URL(value).pathname.split("/").filter(Boolean).pop();
  return basename ? decodeURIComponent(basename).slice(0, 180) : "Invoice";
}

async function downloadPdfs(sessionId: string): Promise<DownloadedPdf[]> {
  const response = await browserbaseClient().sessions.downloads.list(sessionId);
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`Browserbase downloads failed with HTTP ${response.status}.`);

  const archive = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf") || startsWithPdfHeader(archive)) {
    return [{ name: "download.pdf", bytes: archive }];
  }

  const entries = unzipSync(archive);
  return Object.entries(entries)
    .filter(([name, bytes]) => name.toLowerCase().endsWith(".pdf") || startsWithPdfHeader(bytes))
    .slice(0, MAX_PDFS)
    .map(([name, bytes], index) => ({
      name: safeFilename(name, index),
      bytes,
    }));
}

async function uploadPdf(notion: Client, pdf: DownloadedPdf): Promise<UploadedPdf> {
  try {
    const fileUploadId = await uploadDirectly(notion, pdf);
    return { name: pdf.name, fileUploadId };
  } catch (directError) {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) throw directError;

    const blob = await put(`notion-agent/${pdf.name}`, Buffer.from(pdf.bytes), {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/pdf",
      token,
    });
    try {
      const upload = await notion.fileUploads.create({
        mode: "external_url",
        filename: pdf.name,
        content_type: "application/pdf",
        external_url: blob.url,
      });
      await waitUntilUploaded(notion, upload.id);
      return { name: pdf.name, fileUploadId: upload.id, blobUrl: blob.url };
    } catch (error) {
      await del(blob.url, { token }).catch(() => undefined);
      throw error;
    }
  }
}

async function uploadDirectly(notion: Client, pdf: DownloadedPdf): Promise<string> {
  const numberOfParts = Math.ceil(pdf.bytes.byteLength / SINGLE_PART_LIMIT);
  const upload = await notion.fileUploads.create({
    mode: numberOfParts === 1 ? "single_part" : "multi_part",
    filename: pdf.name,
    content_type: "application/pdf",
    ...(numberOfParts === 1 ? {} : { number_of_parts: numberOfParts }),
  });

  for (let index = 0; index < numberOfParts; index += 1) {
    const start = index * SINGLE_PART_LIMIT;
    const end = Math.min(start + SINGLE_PART_LIMIT, pdf.bytes.byteLength);
    const part = pdf.bytes.slice(start, end);
    await notion.fileUploads.send({
      file_upload_id: upload.id,
      file: {
        filename: pdf.name,
        data: new Blob([new Uint8Array(part).buffer], { type: "application/pdf" }),
      },
      ...(numberOfParts === 1 ? {} : { part_number: String(index + 1) }),
    });
  }

  if (numberOfParts > 1) {
    await notion.fileUploads.complete({ file_upload_id: upload.id });
  }
  return upload.id;
}

async function waitUntilUploaded(notion: Client, fileUploadId: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const upload = await notion.fileUploads.retrieve({ file_upload_id: fileUploadId });
    if (upload.status === "uploaded") return;
    if (upload.status === "failed" || upload.status === "expired") {
      throw new Error(`Notion file import ended with status ${upload.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Notion file import did not complete within 30 seconds.");
}

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
}

function safeFilename(path: string, index: number): string {
  const basename = path.split(/[\\/]/u).pop()?.trim() || `download-${index + 1}.pdf`;
  const normalized = basename.replace(/[^a-zA-Z0-9._ -]/gu, "_").slice(0, 180);
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized}.pdf`;
}
