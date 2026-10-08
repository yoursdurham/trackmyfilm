import { NextResponse } from "next/server";
import { touchDisplayHeartbeat } from "@/lib/db";
import { isDisplaySlug, parseHeartbeatClient } from "@/lib/display";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const MAX_BODY_BYTES = 2048;

type Bucket = { count: number; resetAt: number };
const hits = new Map<string, Bucket>();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

function limited(key: string) {
  const now = Date.now();
  const bucket = hits.get(key);
  if (!bucket || bucket.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (bucket.count >= MAX_PER_WINDOW) return true;
  bucket.count += 1;
  return false;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isDisplaySlug(slug)) return json({ error: "Unknown screen" }, 404);

  if (limited(`${clientIp(req)}:${slug}`)) {
    return json({ error: "Too many heartbeats" }, 429);
  }

  const declared = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: "Heartbeat is too large" }, 413);
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json({ error: "Heartbeat is too large" }, 413);

  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  }

  const client = parseHeartbeatClient(body, req.headers.get("user-agent"));

  try {
    const updated = await touchDisplayHeartbeat(slug, client);
    if (!updated) return json({ error: "Unknown screen" }, 404);
    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/displays/:slug/heartbeat]", message);
    return json({ error: "Failed to record heartbeat" }, 500);
  }
}
