import { getOrderById, updateOrder } from "@/lib/db";
import { normalizeEmail, isWithinDedupWindow } from "@/lib/validation";
import type { FilmOrder } from "@/lib/types";

type TemplateName =
  | "film_drop_received"
  | "film_at_lab"
  | "process_only_finished"
  | "scans_sent";

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

export class EmailSendError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.details = details;
  }
}

const DEDUP_FIELDS: Record<TemplateName, keyof FilmOrder> = {
  film_drop_received: "received_email_sent_at",
  film_at_lab: "at_lab_email_sent_at",
  process_only_finished: "process_only_finished_emailed_at",
  scans_sent: "scans_sent_email_sent_at",
};

export const KNOWN_EMAIL_TEMPLATES = Object.keys(DEDUP_FIELDS) as TemplateName[];

function getTemplateIds(): Record<TemplateName, string | undefined> {
  return {
    film_drop_received: process.env.RESEND_TEMPLATE_FILM_DROP_RECEIVED,
    film_at_lab: process.env.RESEND_TEMPLATE_FILM_AT_LAB,
    process_only_finished: process.env.RESEND_TEMPLATE_PROCESS_ONLY_FINISHED,
    scans_sent: process.env.RESEND_TEMPLATE_SCANS_SENT,
  };
}

function isKnownEmailTemplate(template: string): template is TemplateName {
  return (KNOWN_EMAIL_TEMPLATES as string[]).includes(template);
}

function shouldSkipEmail(template: TemplateName, lastSent: string | undefined) {
  if (template === "process_only_finished") {
    return Boolean(lastSent);
  }

  return isWithinDedupWindow(lastSent);
}
function buildFilmDetailsHtml(rollDetails: unknown) {
  if (!Array.isArray(rollDetails) || rollDetails.length === 0) {
    return "";
  }

  return rollDetails
    .map((roll, index) => {
      if (!roll || typeof roll !== "object") return "";

      const r = roll as {
        film_type?: string;
        film_process?: string;
        scan_size?: string;
        film_stock?: string;
        prints_4x6?: boolean;
      };

      const parts = [
        r.film_type,
        r.film_process,
        r.scan_size,
        r.film_stock,
      ].filter(Boolean);

      if (parts.length === 0) return "";

      const prints = r.prints_4x6 ? " + 4x6 Prints" : "";

      return `<p style="margin:0 0 6px;padding:0;">Roll ${index + 1}: ${parts.join(" / ")}${prints}</p>`;
    })
    .join("");
}
export async function sendOrderEmail(orderId: string, template: string) {
  if (!orderId || !template) {
    throw new EmailSendError("order_id and template are required", 400);
  }

  if (!isKnownEmailTemplate(template)) {
    throw new EmailSendError(
      `Unknown template "${template}". Valid: ${KNOWN_EMAIL_TEMPLATES.join(", ")}`,
      400
    );
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error("[email] RESEND_API_KEY not configured");
    throw new EmailSendError("RESEND_API_KEY not configured", 500);
  }

  const order = await getOrderById(orderId);
  if (!order) {
    throw new EmailSendError("Order not found", 404);
  }

  const recipientEmail = order.customer_email ? normalizeEmail(order.customer_email) : null;
  if (!recipientEmail) {
    throw new EmailSendError("Order has no customer email - cannot send", 400);
  }

  const dedupField = DEDUP_FIELDS[template];
  const lastSent = order[dedupField] as string | undefined;
  if (shouldSkipEmail(template, lastSent)) {
    const reason = template === "process_only_finished"
      ? "process_only_finished_emailed_at is already set for this order"
      : `${dedupField} is within the one-hour dedup window`;
    console.log("[email] Skipping duplicate send:", {
      orderId,
      orderNumber: order.order_number,
      template,
      dedupField,
      lastSent,
      reason,
    });
    return {
      success: true,
      skipped: true,
      reason,
    };
  }

  const templateId = getTemplateIds()[template];
  console.log("[email] Template environment check:", {
    orderId,
    orderNumber: order.order_number,
    template,
    envVar: template === "process_only_finished"
      ? "RESEND_TEMPLATE_PROCESS_ONLY_FINISHED"
      : undefined,
    templateIdConfigured: Boolean(templateId),
  });

  if (!templateId) {
    const envVarName = template === "process_only_finished"
      ? "RESEND_TEMPLATE_PROCESS_ONLY_FINISHED"
      : `RESEND_TEMPLATE_${template.toUpperCase()}`;
    console.error("[email] Missing Resend template ID:", {
      orderId,
      orderNumber: order.order_number,
      template,
      envVarName,
    });
    throw new EmailSendError(
      `Template ID not configured for "${template}" - set ${envVarName}`,
      500
    );
  }

 const nameParts = (order.customer_name || "there").trim().split(" ");

const formatDate = (date?: string | null) =>
  date
    ? new Date(date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
    : "";

const variables: Record<string, string> = {
  first_name: nameParts[0] ?? "",
  last_name: nameParts.slice(1).join(" "),

  order_number: order.order_number ?? "",
  roll_count: String(order.roll_count ?? 0),
  film_details_html: buildFilmDetailsHtml(order.roll_details),

  received_by_yours_at: formatDate(order.received_by_yours_at),
  at_lab_at: formatDate(order.at_lab_at),
  scans_sent_at: formatDate(order.scans_sent_at),
};

console.log("EMAIL VARIABLES", JSON.stringify(variables, null, 2));
  if (template === "scans_sent") {
    variables.wetransfer_link = order.wetransfer_link ?? "";
  }

  if (template === "process_only_finished") {
    variables.negatives_ready_message =
      "Your negatives are ready. No scans are included with this Process Only order.";
    variables.pickup_instructions =
      "Please reply to this email if you need help coordinating pickup or delivery.";
  }

  const payload = {
    from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
    to: [recipientEmail],
    reply_to: process.env.REPLY_TO_EMAIL || "hello@yoursdurham.com",
    template: {
      id: templateId,
      variables,
    },
  };

  console.log("[email] Sending Resend template:", {
    orderId,
    orderNumber: order.order_number,
    template,
    recipientEmail,
  });

  let resendRes: Response;
  let resendData: ResendResponse;
  try {
    console.log("[email] Resend API call reached - about to fetch:", {
      orderId,
      orderNumber: order.order_number,
      template,
    });
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    resendData = await resendRes.json() as ResendResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Resend error";
    console.error("[email] Resend request failed:", {
      orderId,
      orderNumber: order.order_number,
      template,
      error: message,
    });
    await updateOrder(orderId, {
      email_status: "failed",
      email_error: message,
    });
    throw new EmailSendError(message, 502);
  }

  console.log("[email] Resend API response:", {
    orderId,
    orderNumber: order.order_number,
    template,
    ok: resendRes.ok,
    status: resendRes.status,
    id: resendData.id,
    error: resendData.message,
  });

  if (!resendRes.ok) {
    const errorMsg = resendData.message ?? JSON.stringify(resendData);
    console.error("[email] Resend rejected request:", JSON.stringify(resendData, null, 2));
    await updateOrder(orderId, {
      email_status: "failed",
      email_error: `${resendData.name ?? "ResendError"}: ${errorMsg}`,
    });
    throw new EmailSendError(
      `${resendData.name ?? "ResendError"}: ${errorMsg}`,
      502,
      resendData
    );
  }

  const now = new Date().toISOString();
  await updateOrder(orderId, {
    [dedupField]: now,
    email_status: "sent",
    email_error: null,
  });

  return {
    success: true,
    emailId: resendData.id,
    template,
    sentTo: recipientEmail,
  };
}
