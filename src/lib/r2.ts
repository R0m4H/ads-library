import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 holds our saved copies of ad pictures and videos. R2 speaks the S3 protocol, so the standard S3
 * client works. The bucket is private: files are only ever served through the app (/api/ads/[id]/preview and
 * /api/ads/[id]/video), so only signed-in team members can see them.
 *
 * Needs four environment variables (Vercel project settings, and .env.local for local runs):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */

export function isR2Configured(): boolean {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

let cached: S3Client | null = null;

function client(): S3Client {
  if (!isR2Configured()) throw new Error("Preview storage (Cloudflare R2) is not set up: the R2_* environment variables are missing.");
  cached ??= new S3Client({
    region: "auto", // R2 has no regions; "auto" is its value
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cached;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "private, max-age=31536000, immutable",
    })
  );
}

export interface StoredObject {
  body: ReadableStream;
  contentType: string;
  /** Bytes in this response (the requested range, if one was asked for). */
  contentLength?: number;
  /** Set when a range was requested, e.g. "bytes 0-1023/52000". */
  contentRange?: string;
}

/** A saved file, or null if there is no such object. Pass a Range header value to get just part of it (video seeking). */
export async function getObject(key: string, range?: string): Promise<StoredObject | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Range: range }));
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType ?? "application/octet-stream",
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
    };
  } catch (e) {
    if (e instanceof Error && (e.name === "NoSuchKey" || e.name === "NotFound")) return null;
    throw e;
  }
}
