import { NextResponse } from "next/server";
import { getOrderByNumberAndEmail, updateOrder } from "@/lib/db";
import { normalizeEmail, normalizeOrderNumber } from "@/lib/validation";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 3;
const ORDER_EMAIL_COOLDOWN_MS = 60_000;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimit = new Map<string, RateLimitEntry>();
const orderCooldownFallback = new Map<string, number>();

function successResponse() {
  return NextResponse.json({ success: true });
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();
  return forwardedIp || req.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const existing = rateLimit.get(ip);

  if (!existing || existing.resetAt <= now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  existing.count += 1;
  rateLimit.set(ip, existing);
  return false;
}

function isWithinOrderCooldown(orderId: string, lastEmailedAt?: string | null) {
  const now = Date.now();
  const fallbackSentAt = orderCooldownFallback.get(orderId);
  const dbSentAt = lastEmailedAt ? new Date(lastEmailedAt).getTime() : 0;
  const lastSentAt = Math.max(fallbackSentAt ?? 0, Number.isNaN(dbSentAt) ? 0 : dbSentAt);

  return lastSentAt > 0 && now - lastSentAt < ORDER_EMAIL_COOLDOWN_MS;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return successResponse();
  }

  try {
    const body = await req.json() as { orderNumber?: string; email?: string };
    const orderNumber = body.orderNumber ? normalizeOrderNumber(body.orderNumber) : "";
    const email = body.email ? normalizeEmail(body.email) : "";

    if (!orderNumber || !email) {
      return successResponse();
    }

    const order = await getOrderByNumberAndEmail(orderNumber, email);
    if (!order || order.status !== "Scans Sent" || !order.wetransfer_link) {
      return successResponse();
    }

    if (isWithinOrderCooldown(order.id, order.last_emailed_at)) {
      console.log("[resend-link] Cooldown blocked resend for order:", order.order_number);
      return successResponse();
    }

    const apiKey = process.env.RESEND_API_KEY;
    const templateId = process.env.RESEND_TEMPLATE_SCANS_SENT;
    if (!apiKey || !templateId) {
      console.error("[resend-link] Missing Resend configuration");
      return successResponse();
    }

    const variables = {
      first_name: (order.customer_name || "there").trim().split(" ")[0],
      order_number: order.order_number ?? "",
      roll_count: String(order.roll_count ?? 0),
      wetransfer_link: order.wetransfer_link,
    };

    const payload = {
      from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
      to: [normalizeEmail(order.customer_email)],
      reply_to: process.env.REPLY_TO_EMAIL || "hello@yoursdurham.com",
      template: {
        id: templateId,
        variables,
      },
    };

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resendData = await resendRes.json().catch(() => ({})) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!resendRes.ok) {
      const message = resendData.message ?? JSON.stringify(resendData);
      console.error("[resend-link] Resend rejected request:", resendData);
      await updateOrder(order.id, {
        email_status: "failed",
        email_error: `${resendData.name ?? "ResendError"}: ${message}`,
      }).catch((error) => {
        console.error("[resend-link] Failed to record email failure:", error);
      });
      return successResponse();
    }

    const now = new Date();
    orderCooldownFallback.set(order.id, now.getTime());

    await updateOrder(order.id, {
      scans_sent_email_sent_at: now.toISOString(),
      last_emailed_at: now.toISOString(),
      email_status: "sent",
      email_error: null,
    }).catch((error) => {
      console.error("[resend-link] Failed to record email success:", error);
    });

    return successResponse();
  } catch (error) {
    console.error("[resend-link] Request failed:", error);
    return successResponse();
  }
}
