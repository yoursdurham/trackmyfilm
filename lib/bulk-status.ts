import { ORDER_STATUS, STATUS_TEMPLATE_MAP } from "@/lib/constants";
import { getOrdersByIds } from "@/lib/db";
import { prepareOrderEmail } from "@/lib/email-service";
import { emailTemplateForStatus } from "@/lib/order-service";
import {
  commitPlannedStatus,
  planStatusChange,
} from "@/lib/status-update-service";
import {
  orderStatusIdempotencyKey,
  sendStatusEmailBatch,
  type StatusEmailJob,
  type StatusEmailSendResult,
} from "@/lib/status-email-batch";
import type { FilmOrder, OrderStatus } from "@/lib/types";

const STATUS_WRITE_CONCURRENCY = 8;

export type BulkEmailFailure = {
  orderId: string;
  orderNumber?: string;
  error: string;
};

export type BulkStatusFailure = {
  orderId: string;
  orderNumber?: string;
  error: string;
};

export type BulkStatusResult = {
  success: boolean;
  status: OrderStatus;
  summary: string;
  movedCount: number;
  skippedCount: number;
  successCount: number;
  failureCount: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  failures: BulkStatusFailure[];
  emailFailures: BulkEmailFailure[];
};

type EmailCandidate = {
  order: FilmOrder;
  anchor: string;
};

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function formatBulkStatusSummary(input: {
  emailsOnly: boolean;
  sendsEmail: boolean;
  movedCount: number;
  skippedCount: number;
  statusFailureCount: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
}): string {
  const emailClause = () => {
    if (input.emailsSent === 0 && input.emailsFailed === 0 && input.emailsSkipped > 0) {
      return `${countLabel(input.emailsSkipped, "email")} already sent`;
    }
    const sent = `${countLabel(input.emailsSent, "email")} sent`;
    if (input.emailsFailed > 0) return `${sent}, ${countLabel(input.emailsFailed, "email")} failed`;
    return sent;
  };

  if (input.emailsOnly) {
    const parts = [`Retried emails: ${emailClause()}`];
    if (input.statusFailureCount > 0) parts.push(`${input.statusFailureCount} not retried`);
    return parts.join(", ");
  }

  const parts = [`Moved ${countLabel(input.movedCount, "order")}`];
  if (input.skippedCount > 0) parts.push(`${input.skippedCount} already at this status`);
  if (input.statusFailureCount > 0) parts.push(`${input.statusFailureCount} not moved`);
  if (input.sendsEmail) parts.push(emailClause());
  return parts.join(", ");
}

function statusSendsEmail(status: OrderStatus): boolean {
  return Boolean(STATUS_TEMPLATE_MAP[status]);
}

function emailAnchor(order: FilmOrder, status: OrderStatus): string {
  if (status === ORDER_STATUS.RECEIVED_BY_YOURS) return order.received_by_yours_at ?? order.status_updated_at ?? "";
  if (status === ORDER_STATUS.RECEIVED_AT_LAB) return order.at_lab_at ?? order.status_updated_at ?? "";
  if (status === ORDER_STATUS.SCANS_SENT) return order.scans_sent_at ?? order.status_updated_at ?? "";
  return order.status_updated_at ?? "";
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function queueEmail(candidate: EmailCandidate, status: OrderStatus): Promise<
  | { kind: "job"; job: StatusEmailJob }
  | { kind: "skipped" }
  | { kind: "failed"; failure: BulkEmailFailure }
> {
  const template = emailTemplateForStatus(candidate.order, status);
  if (!template) return { kind: "skipped" };

  let prepared: Awaited<ReturnType<typeof prepareOrderEmail>>;
  try {
    prepared = await prepareOrderEmail(candidate.order, template);
  } catch (error) {
    return {
      kind: "failed",
      failure: {
        orderId: candidate.order.id,
        orderNumber: candidate.order.order_number,
        error: error instanceof Error ? error.message : "Could not prepare email",
      },
    };
  }

  if (prepared.outcome === "skipped") return { kind: "skipped" };
  if (prepared.outcome === "error") {
    return {
      kind: "failed",
      failure: {
        orderId: candidate.order.id,
        orderNumber: candidate.order.order_number,
        error: prepared.message,
      },
    };
  }

  return {
    kind: "job",
    job: {
      orderId: candidate.order.id,
      orderNumber: candidate.order.order_number,
      idempotencyKey: orderStatusIdempotencyKey(candidate.order.id, status, candidate.anchor),
      dedupField: prepared.dedupField,
      payload: prepared.payload,
    },
  };
}

function countEmailResults(results: StatusEmailSendResult[]) {
  const emailFailures: BulkEmailFailure[] = [];
  let emailsSent = 0;
  for (const result of results) {
    if (result.sent) {
      emailsSent += 1;
      continue;
    }
    emailFailures.push({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      error: result.error ?? "Email failed",
    });
  }
  return { emailsSent, emailFailures };
}

export async function bulkUpdateOrderStatus({
  orderIds,
  status,
  emailsOnly = false,
}: {
  orderIds: string[];
  status: OrderStatus;
  emailsOnly?: boolean;
}): Promise<BulkStatusResult> {
  const uniqueIds = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  const loaded = await getOrdersByIds(uniqueIds);
  const byId = new Map(loaded.map((order) => [order.id, order]));
  const sendsEmail = statusSendsEmail(status);

  const failures: BulkStatusFailure[] = [];
  const emailCandidates: EmailCandidate[] = [];
  let movedCount = 0;
  let skippedCount = 0;

  if (emailsOnly) {
    for (const orderId of uniqueIds) {
      const order = byId.get(orderId);
      if (!order) {
        failures.push({ orderId, error: "Order not found" });
        continue;
      }
      if (order.status !== status) {
        failures.push({
          orderId,
          orderNumber: order.order_number,
          error: `Order is ${order.status}, not ${status}`,
        });
        continue;
      }
      emailCandidates.push({ order, anchor: emailAnchor(order, status) });
    }
  } else {
    const writes: { order: FilmOrder; updateData: Partial<FilmOrder> }[] = [];
    for (const orderId of uniqueIds) {
      const order = byId.get(orderId);
      if (!order) {
        failures.push({ orderId, error: "Order not found" });
        continue;
      }
      const plan = planStatusChange(order, { new_status: status });
      if (plan.kind === "done") {
        if (plan.result.success && plan.result.skipped) {
          skippedCount += 1;
          emailCandidates.push({ order, anchor: emailAnchor(order, status) });
        } else if (!plan.result.success) {
          failures.push({
            orderId,
            orderNumber: order.order_number,
            error: plan.result.error ?? "Could not move order",
          });
        }
        continue;
      }
      writes.push({ order, updateData: plan.updateData });
    }

    const saved = await mapPool(writes, STATUS_WRITE_CONCURRENCY, async (write) => {
      try {
        await commitPlannedStatus(write.order.id, write.updateData);
        return { ok: true as const, order: { ...write.order, ...write.updateData } };
      } catch (error) {
        return {
          ok: false as const,
          failure: {
            orderId: write.order.id,
            orderNumber: write.order.order_number,
            error: error instanceof Error ? error.message : "Could not save order status",
          },
        };
      }
    });

    for (const result of saved) {
      if (!result.ok) {
        failures.push(result.failure);
        continue;
      }
      movedCount += 1;
      if (result.order.status === status) {
        emailCandidates.push({ order: result.order, anchor: emailAnchor(result.order, status) });
      }
    }
  }

  const jobs: StatusEmailJob[] = [];
  let emailsSkipped = 0;
  const prepareFailures: BulkEmailFailure[] = [];
  if (sendsEmail) {
    const prepared = await mapPool(emailCandidates, STATUS_WRITE_CONCURRENCY, (candidate) => (
      queueEmail(candidate, status)
    ));
    for (const item of prepared) {
      if (item.kind === "job") jobs.push(item.job);
      else if (item.kind === "skipped") emailsSkipped += 1;
      else prepareFailures.push(item.failure);
    }
  }

  let sendResults: StatusEmailSendResult[] = [];
  if (jobs.length > 0) {
    try {
      sendResults = await sendStatusEmailBatch(jobs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send status emails";
      console.error("[status] Bulk email batch failed after status writes:", message);
      sendResults = jobs.map((job) => ({
        orderId: job.orderId,
        orderNumber: job.orderNumber,
        sent: false,
        error: message,
      }));
    }
  }

  const counted = countEmailResults(sendResults);
  const emailFailures = [...prepareFailures, ...counted.emailFailures];
  const emailsSent = counted.emailsSent;
  const summary = formatBulkStatusSummary({
    emailsOnly,
    sendsEmail,
    movedCount,
    skippedCount,
    statusFailureCount: failures.length,
    emailsSent,
    emailsFailed: emailFailures.length,
    emailsSkipped,
  });

  return {
    success: failures.length === 0,
    status,
    summary,
    movedCount,
    skippedCount,
    successCount: movedCount + skippedCount,
    failureCount: failures.length,
    emailsSent,
    emailsFailed: emailFailures.length,
    emailsSkipped,
    failures,
    emailFailures,
  };
}
