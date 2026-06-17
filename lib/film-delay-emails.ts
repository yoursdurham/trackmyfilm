import { getOrdersPendingDelayEmail } from "@/lib/db";
import { sendOrderEmail } from "@/lib/email-service";
import { isLabDelayUrgent } from "@/lib/order-urgency";

export type FilmDelayEmailResult = {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function processFilmDelayEmails(): Promise<FilmDelayEmailResult> {
  const orders = await getOrdersPendingDelayEmail();
  const result: FilmDelayEmailResult = {
    checked: orders.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const order of orders) {
    if (!isLabDelayUrgent(order)) {
      result.skipped++;
      continue;
    }

    try {
      const emailResult = await sendOrderEmail(order.id, "film_delay");
      if (emailResult.skipped) {
        result.skipped++;
        console.log("[film-delay] Skipped:", {
          orderId: order.id,
          orderNumber: order.order_number,
          reason: emailResult.reason,
        });
        continue;
      }

      result.sent++;
      console.log("[film-delay] Email sent:", {
        orderId: order.id,
        orderNumber: order.order_number,
        emailId: emailResult.emailId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.failed++;
      result.errors.push(`${order.order_number}: ${message}`);
      console.error("[film-delay] Email failed:", {
        orderId: order.id,
        orderNumber: order.order_number,
        error: message,
      });
    }
  }

  console.log("[film-delay] Job complete:", result);
  return result;
}
