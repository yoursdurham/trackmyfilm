import { RETAIL_HOURS_LABEL } from "@/lib/shop-hours";
import { isValidEmail, normalizeEmail } from "@/lib/validation";
import {
  buildPeople,
  filterNeedsAccounts,
  filterNeedsPhotos,
  selectAudience,
  type AccountDirectory,
  type CustomerRow,
  type OrderRow,
  type SubscriptionRow,
} from "@/lib/marketing/audience";
import { enrollmentCandidates, recheckBeforeSend, type EnrollmentRecord } from "@/lib/marketing/automations";
import {
  audienceFingerprint,
  campaignIsDue,
  confirmDecision,
  deliveryIdempotencyKey,
  deliveryShouldSend,
  nextCampaignStatus,
  frequencyCapBlocks,
  planRecipientInserts,
  sendResendMessages,
  type ResendMessage,
} from "@/lib/marketing/delivery";
import { engagementReport } from "@/lib/marketing/metrics";
import {
  applyPersonalization,
  listUnsubscribeHeaders,
  marketingFromAddress,
  personalizationFor,
  renderMarketingHtml,
  renderMarketingText,
  signUnsubscribeToken,
  unsubscribeUrl,
} from "@/lib/marketing/messages";
import { starterAutomations } from "@/lib/marketing/starters";
import { marketingSupabase, raiseStorage } from "@/lib/marketing/supabase";
import {
  APP_ORIGIN,
  DEFAULT_ATTRIBUTION_WINDOW_DAYS,
  DEFAULT_FREQUENCY_CAP_COUNT,
  DEFAULT_FREQUENCY_CAP_DAYS,
  DEFAULT_PHYSICAL_ADDRESS,
  DEFAULT_TIMEZONE,
  SEND_BATCH_LIMIT,
  SHOP_NAME,
  type AutomationDefinition,
  type CampaignStatus,
  type EmailBlock,
  type FilterNode,
  type MarketingPerson,
} from "@/lib/marketing/types";

const ORDER_COLUMNS = "id,customer_id,customer_email,status,dropoff_date,created_at,scans_sent_at,received_by_yours_at,at_lab_at,film_type,film_process,film_stock,roll_details,status_history";

export type MarketingSettings = {
  physicalAddress: string;
  fromName: string;
  replyTo: string | null;
  frequencyCapCount: number;
  frequencyCapDays: number;
  attributionWindowDays: number;
  timezone: string;
};

type SettingsRow = {
  physical_address: string;
  from_name: string;
  reply_to: string | null;
  frequency_cap_count: number;
  frequency_cap_days: number;
  attribution_window_days: number;
  timezone: string;
};

function db() {
  return marketingSupabase();
}

function mapSettings(row: SettingsRow | null): MarketingSettings {
  return {
    physicalAddress: row?.physical_address || DEFAULT_PHYSICAL_ADDRESS,
    fromName: row?.from_name || SHOP_NAME,
    replyTo: row?.reply_to ?? null,
    frequencyCapCount: row?.frequency_cap_count ?? DEFAULT_FREQUENCY_CAP_COUNT,
    frequencyCapDays: row?.frequency_cap_days ?? DEFAULT_FREQUENCY_CAP_DAYS,
    attributionWindowDays: row?.attribution_window_days ?? DEFAULT_ATTRIBUTION_WINDOW_DAYS,
    timezone: row?.timezone || DEFAULT_TIMEZONE,
  };
}

export async function getSettings(): Promise<MarketingSettings> {
  const { data, error } = await db().from("marketing_settings").select("*").eq("id", 1).maybeSingle();
  if (error) raiseStorage(error);
  return mapSettings(data as SettingsRow | null);
}

export async function saveSettings(patch: Partial<MarketingSettings>, actor: string): Promise<MarketingSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  const { error } = await db().from("marketing_settings").upsert({
    id: 1,
    physical_address: next.physicalAddress,
    from_name: next.fromName || SHOP_NAME,
    reply_to: next.replyTo,
    frequency_cap_count: next.frequencyCapCount,
    frequency_cap_days: next.frequencyCapDays,
    attribution_window_days: next.attributionWindowDays,
    timezone: DEFAULT_TIMEZONE,
    updated_at: new Date().toISOString(),
  });
  if (error) raiseStorage(error);
  await audit(actor, "settings.updated", "settings", "1", {});
  return getSettings();
}

export async function audit(actor: string | null, action: string, entityType: string, entityId: string | null, detail: Record<string, unknown>) {
  const { error } = await db().from("marketing_audit").insert({
    actor,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail,
  });
  if (error) raiseStorage(error);
}

export type LoadedContext = {
  people: MarketingPerson[];
  accounts: AccountDirectory;
  photosUnavailable: string | null;
};

export async function loadContext(): Promise<LoadedContext> {
  const [customers, orders, subscriptions, photos, accounts] = await Promise.all([
    db().from("customers").select("id,email,first_name,last_name,created_at,total_dropoffs,total_rolls,last_dropoff_date"),
    db().from("film_orders").select(ORDER_COLUMNS),
    db().from("marketing_subscriptions").select("email,customer_id,status,suppression_reason,consented_at"),
    db().from("photo_submissions").select("email,created_at"),
    listAuthAccounts(),
  ]);
  if (customers.error) raiseStorage(customers.error);
  if (orders.error) raiseStorage(orders.error);
  if (subscriptions.error) raiseStorage(subscriptions.error);
  const photosUnavailable = photos.error ? "Photo submissions could not be read, so photo filters are unavailable." : null;
  return {
    people: buildPeople({
      customers: (customers.data ?? []) as CustomerRow[],
      orders: (orders.data ?? []) as OrderRow[],
      accounts,
      photos: photos.error ? [] : (photos.data ?? []) as { email?: string | null }[],
      subscriptions: (subscriptions.data ?? []) as SubscriptionRow[],
    }),
    accounts,
    photosUnavailable,
  };
}

async function listAuthAccounts(): Promise<AccountDirectory> {
  const users: { email: string; createdAt: string }[] = [];
  try {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return { state: "unavailable", reason: "Sign-in accounts could not be read. Account filters are paused, which is not the same as zero accounts." };
      for (const user of data.users) {
        if (user.email && user.created_at) users.push({ email: user.email, createdAt: user.created_at });
      }
      if (data.users.length < 1000) break;
    }
  } catch {
    return { state: "unavailable", reason: "Sign-in accounts could not be read. Account filters are paused, which is not the same as zero accounts." };
  }
  return { state: "ready", users };
}

export function audienceSize(people: MarketingPerson[]): number {
  return people.filter((person) => person.emailValid && (person.customerId || person.orders.length > 0)).length;
}

export function subscriberCount(people: MarketingPerson[]): number {
  return people.filter((person) => person.subscriptionStatus === "subscribed" && person.consentedAt && person.emailValid).length;
}

export async function previewFilter(filter: FilterNode, now = new Date()) {
  const context = await loadContext();
  if (filterNeedsAccounts(filter) && context.accounts.state === "unavailable") {
    return { unavailable: context.accounts.reason, recipients: [], excluded: [], fingerprint: "" };
  }
  if (filterNeedsPhotos(filter) && context.photosUnavailable) {
    return { unavailable: context.photosUnavailable, recipients: [], excluded: [], fingerprint: "" };
  }
  const selected = selectAudience(context.people, filter, now);
  return {
    unavailable: null as string | null,
    recipients: selected.recipients.slice(0, 50).map(publicPerson),
    recipientCount: selected.recipients.length,
    excluded: selected.excluded.slice(0, 50).map((row) => ({ ...publicPerson(row.person), reasons: row.reasons })),
    excludedCount: selected.excluded.length,
    fingerprint: audienceFingerprint(selected.recipients.map((person) => person.email)),
  };
}

function publicPerson(person: MarketingPerson) {
  return {
    customerId: person.customerId,
    email: person.email,
    firstName: person.firstName,
    lastName: person.lastName,
    subscriptionStatus: person.subscriptionStatus,
    accountCreatedAt: person.accountCreatedAt,
    orderCount: person.orders.length,
  };
}

type CampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  segment_id: string | null;
  ad_hoc_filter: FilterNode | null;
  subject: string;
  preview_text: string;
  blocks: EmailBlock[];
  plain_text: string;
  scheduled_at: string | null;
  timezone: string;
  audience_fingerprint: string | null;
  created_at?: string;
  updated_at?: string;
};

export function mapCampaign(row: CampaignRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    segmentId: row.segment_id,
    adHocFilter: row.ad_hoc_filter,
    subject: row.subject,
    previewText: row.preview_text,
    blocks: row.blocks ?? [],
    plainText: row.plain_text ?? "",
    scheduledAt: row.scheduled_at,
    timezone: row.timezone || DEFAULT_TIMEZONE,
    audienceFingerprint: row.audience_fingerprint,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function listCampaigns() {
  const { data, error } = await db().from("marketing_campaigns").select("*").order("updated_at", { ascending: false }).limit(100);
  if (error) raiseStorage(error);
  return ((data ?? []) as CampaignRow[]).map(mapCampaign);
}

export async function getCampaign(id: string) {
  const { data, error } = await db().from("marketing_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) raiseStorage(error);
  if (!data) return null;
  const campaign = mapCampaign(data as CampaignRow);
  const deliveries = await listDeliveries(id);
  return { campaign, deliveries };
}

async function listDeliveries(campaignId: string) {
  const { data, error } = await db().from("marketing_deliveries").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true }).limit(500);
  if (error) raiseStorage(error);
  return data ?? [];
}

export async function saveCampaign(id: string | null, input: Record<string, unknown>, actor: string) {
  const row = {
    name: String(input.name ?? "Untitled campaign").slice(0, 140),
    segment_id: typeof input.segmentId === "string" ? input.segmentId : null,
    ad_hoc_filter: input.adHocFilter ?? null,
    subject: String(input.subject ?? "").slice(0, 200),
    preview_text: String(input.previewText ?? "").slice(0, 200),
    blocks: input.blocks ?? [],
    plain_text: String(input.plainText ?? "").slice(0, 8000),
    timezone: DEFAULT_TIMEZONE,
    updated_at: new Date().toISOString(),
  };
  if (!id) {
    const { data, error } = await db().from("marketing_campaigns").insert({ ...row, status: "draft", created_by: actor }).select("*").single();
    if (error) raiseStorage(error);
    await audit(actor, "campaign.created", "campaign", (data as CampaignRow).id, {});
    return mapCampaign(data as CampaignRow);
  }
  const existing = await getCampaign(id);
  if (!existing) return null;
  if (existing.campaign.status !== "draft") {
    throw new MarketingWriteError("Only a draft can be edited. Duplicate it to start another draft.");
  }
  const { data, error } = await db().from("marketing_campaigns").update(row).eq("id", id).select("*").single();
  if (error) raiseStorage(error);
  await audit(actor, "campaign.updated", "campaign", id, {});
  return mapCampaign(data as CampaignRow);
}

export class MarketingWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingWriteError";
  }
}

export async function duplicateCampaign(id: string, actor: string) {
  const found = await getCampaign(id);
  if (!found) return null;
  const source = found.campaign;
  return saveCampaign(null, {
    name: `${source.name} copy`,
    segmentId: source.segmentId,
    adHocFilter: source.adHocFilter,
    subject: source.subject,
    previewText: source.previewText,
    blocks: source.blocks,
    plainText: source.plainText,
  }, actor);
}

export async function setCampaignStatus(id: string, status: CampaignStatus, actor: string, action: string) {
  const { error } = await db().from("marketing_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) raiseStorage(error);
  await audit(actor, action, "campaign", id, { status });
}

export async function confirmCampaign(input: {
  id: string;
  actor: string;
  shownFingerprint: string;
  scheduledAt: string;
}) {
  const found = await getCampaign(input.id);
  if (!found) return { error: "Campaign not found.", status: 404 };
  if (found.campaign.status !== "draft") return { error: "Only a draft can be scheduled.", status: 400 };
  const when = Date.parse(input.scheduledAt);
  if (Number.isNaN(when)) return { error: "Choose a date and time.", status: 400 };
  const filter = await resolveFilter(found.campaign.segmentId, found.campaign.adHocFilter);
  if ("error" in filter) return { error: filter.error, status: 400 };
  const context = await loadContext();
  const selected = selectAudience(context.people, filter.filter, new Date());
  const actual = audienceFingerprint(selected.recipients.map((person) => person.email));
  const decision = confirmDecision({
    shownFingerprint: input.shownFingerprint,
    actualFingerprint: actual,
    recipientCount: selected.recipients.length,
  });
  if (!decision.ok) return { error: decision.error, status: 409, fingerprint: actual, recipientCount: selected.recipients.length };
  const existing = found.deliveries.map((row) => ({ email: String((row as { email: string }).email) }));
  const plan = planRecipientInserts(existing, selected.recipients.map((person) => ({ email: person.email })));
  if (plan.insert.length > 0) {
    const rows = plan.insert.map((email) => {
      const person = selected.recipients.find((candidate) => candidate.email === email);
      return {
        campaign_id: input.id,
        customer_id: person?.customerId ?? null,
        email,
        status: "pending",
        idempotency_key: deliveryIdempotencyKey({ campaignId: input.id }, email),
      };
    });
    const { error } = await db().from("marketing_deliveries").upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (error) raiseStorage(error);
  }
  const { error } = await db().from("marketing_campaigns").update({
    status: "scheduled",
    scheduled_at: new Date(when).toISOString(),
    audience_fingerprint: actual,
    updated_at: new Date().toISOString(),
  }).eq("id", input.id);
  if (error) raiseStorage(error);
  await audit(input.actor, "campaign.scheduled", "campaign", input.id, { recipients: selected.recipients.length, scheduledAt: input.scheduledAt });
  return { ok: true as const, recipients: selected.recipients.length };
}

async function resolveFilter(segmentId: string | null, adHoc: FilterNode | null): Promise<{ filter: FilterNode } | { error: string }> {
  if (segmentId) {
    const { data, error } = await db().from("marketing_segments").select("filter").eq("id", segmentId).maybeSingle();
    if (error) raiseStorage(error);
    if (!data) return { error: "That saved segment is no longer available." };
    return { filter: (data as { filter: FilterNode }).filter };
  }
  if (adHoc) return { filter: adHoc };
  return { error: "Choose a saved segment or build a filter. An empty choice does not mean every customer." };
}

export async function cancelRemaining(id: string, actor: string) {
  const { error } = await db().from("marketing_deliveries").update({
    status: "cancelled",
    updated_at: new Date().toISOString(),
  }).eq("campaign_id", id).eq("status", "pending");
  if (error) raiseStorage(error);
  await setCampaignStatus(id, "paused", actor, "campaign.cancelled_remaining");
}

export async function retryFailed(id: string, actor: string) {
  const { error } = await db().from("marketing_deliveries").update({
    status: "pending",
    last_error: null,
    attempts: 0,
    updated_at: new Date().toISOString(),
  }).eq("campaign_id", id).eq("status", "failed");
  if (error) raiseStorage(error);
  await setCampaignStatus(id, "sending", actor, "campaign.retry_failed");
}

type SegmentRow = { id: string; name: string; filter: FilterNode; archived_at: string | null; updated_at?: string };
type TemplateRow = { id: string; name: string; subject: string; preview_text: string; blocks: EmailBlock[]; plain_text: string; updated_at?: string };

export async function listSegments() {
  const { data, error } = await db().from("marketing_segments").select("*").is("archived_at", null).order("updated_at", { ascending: false });
  if (error) raiseStorage(error);
  return (data ?? []) as SegmentRow[];
}

export async function saveSegment(id: string | null, name: string, filter: FilterNode, actor: string) {
  const row = { name: name.slice(0, 140), filter, updated_at: new Date().toISOString() };
  if (!id) {
    const { data, error } = await db().from("marketing_segments").insert(row).select("*").single();
    if (error) raiseStorage(error);
    await audit(actor, "segment.created", "segment", (data as SegmentRow).id, {});
    return data as SegmentRow;
  }
  const { data, error } = await db().from("marketing_segments").update(row).eq("id", id).select("*").single();
  if (error) raiseStorage(error);
  await audit(actor, "segment.updated", "segment", id, {});
  return data as SegmentRow;
}

export async function archiveSegment(id: string, actor: string) {
  const { error } = await db().from("marketing_segments").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) raiseStorage(error);
  await audit(actor, "segment.archived", "segment", id, {});
}

export async function listTemplates() {
  const { data, error } = await db().from("marketing_templates").select("*").order("updated_at", { ascending: false });
  if (error) raiseStorage(error);
  return (data ?? []) as TemplateRow[];
}

export async function saveTemplate(id: string | null, input: { name: string; subject: string; previewText: string; blocks: EmailBlock[]; plainText: string }, actor: string) {
  const row = {
    name: input.name.slice(0, 140),
    subject: input.subject.slice(0, 200),
    preview_text: input.previewText.slice(0, 200),
    blocks: input.blocks,
    plain_text: input.plainText.slice(0, 8000),
    updated_at: new Date().toISOString(),
  };
  if (!id) {
    const { data, error } = await db().from("marketing_templates").insert(row).select("*").single();
    if (error) raiseStorage(error);
    await audit(actor, "template.created", "template", (data as TemplateRow).id, {});
    return data as TemplateRow;
  }
  const { data, error } = await db().from("marketing_templates").update(row).eq("id", id).select("*").single();
  if (error) raiseStorage(error);
  await audit(actor, "template.updated", "template", id, {});
  return data as TemplateRow;
}

type AutomationRow = {
  id: string;
  name: string;
  description: string;
  status: AutomationDefinition["status"];
  trigger: AutomationDefinition["trigger"];
  delay_hours: number;
  eligibility: FilterNode;
  exits: AutomationDefinition["exits"];
  cooldown_days: number;
  reentry: AutomationDefinition["reentry"];
  subject: string;
  preview_text: string;
  blocks: EmailBlock[];
  plain_text: string;
  activated_at: string | null;
};

export function mapAutomation(row: AutomationRow): AutomationDefinition & { id: string } {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    trigger: row.trigger,
    delayHours: row.delay_hours,
    eligibility: row.eligibility,
    exits: row.exits ?? [],
    cooldownDays: row.cooldown_days,
    reentry: row.reentry,
    subject: row.subject,
    previewText: row.preview_text,
    blocks: row.blocks ?? [],
    plainText: row.plain_text ?? "",
    activatedAt: row.activated_at,
  };
}

export async function listAutomations() {
  await ensureStarters();
  const { data, error } = await db().from("marketing_automations").select("*").order("name");
  if (error) raiseStorage(error);
  return ((data ?? []) as AutomationRow[]).map(mapAutomation);
}

async function ensureStarters() {
  const starters = starterAutomations();
  const { data, error } = await db().from("marketing_automations").select("id").in("id", starters.map((starter) => starter.id!));
  if (error) raiseStorage(error);
  const existing = new Set((data ?? []).map((row) => (row as { id: string }).id));
  const missing = starters.filter((starter) => starter.id && !existing.has(starter.id));
  if (missing.length === 0) return;
  const { error: insertError } = await db().from("marketing_automations").insert(missing.map(starterRow));
  if (insertError) raiseStorage(insertError);
}

function starterRow(starter: AutomationDefinition) {
  return {
    id: starter.id,
    name: starter.name,
    description: starter.description,
    status: "draft",
    trigger: starter.trigger,
    delay_hours: starter.delayHours,
    eligibility: starter.eligibility,
    exits: starter.exits,
    cooldown_days: starter.cooldownDays,
    reentry: starter.reentry,
    subject: starter.subject,
    preview_text: starter.previewText,
    blocks: starter.blocks,
    plain_text: starter.plainText,
    activated_at: null,
  };
}

export async function saveAutomation(id: string, input: AutomationDefinition, actor: string) {
  const current = await getAutomation(id);
  if (!current) return null;
  if (current.status === "active") throw new MarketingWriteError("Pause the automation before editing it.");
  const { error } = await db().from("marketing_automations").update({
    name: input.name.slice(0, 140),
    description: input.description.slice(0, 500),
    trigger: input.trigger,
    delay_hours: input.delayHours,
    eligibility: input.eligibility,
    exits: input.exits,
    cooldown_days: input.cooldownDays,
    reentry: input.reentry,
    subject: input.subject.slice(0, 200),
    preview_text: input.previewText.slice(0, 200),
    blocks: input.blocks,
    plain_text: input.plainText.slice(0, 8000),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) raiseStorage(error);
  await audit(actor, "automation.updated", "automation", id, {});
  return getAutomation(id);
}

export async function getAutomation(id: string) {
  const { data, error } = await db().from("marketing_automations").select("*").eq("id", id).maybeSingle();
  if (error) raiseStorage(error);
  return data ? mapAutomation(data as AutomationRow) : null;
}

export async function setAutomationStatus(id: string, status: AutomationDefinition["status"], actor: string) {
  const current = await getAutomation(id);
  if (!current) return null;
  const activatedAt = status === "active" ? (current.activatedAt ?? new Date().toISOString()) : current.activatedAt;
  const { error } = await db().from("marketing_automations").update({
    status,
    activated_at: activatedAt,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) raiseStorage(error);
  await audit(actor, `automation.${status}`, "automation", id, {});
  return getAutomation(id);
}

export async function subscriptionFor(email: string) {
  const normalized = normalizeEmail(email);
  const { data, error } = await db().from("marketing_subscriptions").select("status,suppression_reason,consented_at,unsubscribed_at").eq("email", normalized).maybeSingle();
  if (error) raiseStorage(error);
  return data as { status: string; suppression_reason: string | null; consented_at: string | null; unsubscribed_at: string | null } | null;
}

export async function setConsent(input: {
  email: string;
  customerId: string | null;
  status: "subscribed" | "unsubscribed" | "suppressed";
  reason: "bounced" | "complained" | "invalid" | "manual" | null;
  source: string;
  actor: string | null;
}) {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new MarketingWriteError("That email address does not look complete.");
  const now = new Date().toISOString();
  const { error } = await db().from("marketing_subscriptions").upsert({
    email,
    customer_id: input.customerId,
    status: input.status,
    suppression_reason: input.status === "suppressed" ? (input.reason ?? "manual") : null,
    source: input.source,
    consented_at: input.status === "subscribed" ? now : null,
    unsubscribed_at: input.status === "unsubscribed" ? now : null,
    updated_at: now,
  }, { onConflict: "email" });
  if (error) raiseStorage(error);
  await audit(input.actor, `consent.${input.status}`, "subscription", email, { source: input.source });
}

export async function searchPeople(query: string) {
  const context = await loadContext();
  const needle = query.trim().toLowerCase();
  const people = context.people.filter((person) => person.customerId || person.orders.length > 0 || person.subscriptionStatus !== "none");
  const matched = needle
    ? people.filter((person) => `${person.firstName} ${person.lastName} ${person.email}`.toLowerCase().includes(needle))
    : people;
  return matched.slice(0, 50).map(publicPerson);
}

export async function personProfile(customerId: string) {
  const context = await loadContext();
  const person = context.people.find((candidate) => candidate.customerId === customerId);
  if (!person) return null;
  const [deliveries, enrollments, photos] = await Promise.all([
    db().from("marketing_deliveries").select("id,status,sent_at,skip_reason,last_error,campaign_id,enrollment_id").eq("email", person.email).order("created_at", { ascending: false }).limit(50),
    db().from("marketing_enrollments").select("id,automation_id,status,due_at,exit_reason,enrolled_at").eq("email", person.email).order("enrolled_at", { ascending: false }).limit(50),
    db().from("photo_submissions").select("id,created_at,status").eq("email", person.email).order("created_at", { ascending: false }).limit(20),
  ]);
  if (deliveries.error) raiseStorage(deliveries.error);
  if (enrollments.error) raiseStorage(enrollments.error);
  return {
    person: publicPerson(person),
    subscriptionStatus: person.subscriptionStatus,
    suppressionReason: person.suppressionReason,
    consentedAt: person.consentedAt,
    timeline: timelineFor(person, (photos.data ?? []) as { created_at?: string; status?: string }[]),
    deliveries: deliveries.data ?? [],
    enrollments: enrollments.data ?? [],
  };
}

function timelineFor(person: MarketingPerson, photos: { created_at?: string; status?: string }[]) {
  const events: { at: string; label: string }[] = [];
  if (person.customerCreatedAt) events.push({ at: person.customerCreatedAt, label: "Customer record created" });
  if (person.accountCreatedAt) events.push({ at: person.accountCreatedAt, label: "Sign-in account created" });
  for (const order of person.orders) {
    if (order.dropoffDate) events.push({ at: `${order.dropoffDate}T12:00:00.000Z`, label: "Film dropped off" });
    if (order.receivedAt) events.push({ at: order.receivedAt, label: "Marked received by Yours," });
    if (order.atLabAt) events.push({ at: order.atLabAt, label: "Marked received at the lab" });
    if (order.scansSentAt) events.push({ at: order.scansSentAt, label: "Scans sent" });
    if (order.status === "On Hold") events.push({ at: order.createdAt ?? new Date(0).toISOString(), label: "Order is on hold" });
  }
  for (const photo of photos) {
    if (photo.created_at) events.push({ at: photo.created_at, label: `Photo shared (${photo.status ?? "pending"})` });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

export async function overview() {
  const [settings, context, campaigns, automations, activity] = await Promise.all([
    getSettings(),
    loadContext(),
    listCampaigns(),
    listAutomations(),
    db().from("marketing_audit").select("id,actor,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  if (activity.error) raiseStorage(activity.error);
  const webhookConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim());
  const counts = await deliveryCounts();
  const alerts: { tone: "warning"; text: string }[] = [];
  if (!process.env.RESEND_API_KEY?.trim()) alerts.push({ tone: "warning", text: "RESEND_API_KEY is not set, so marketing email cannot be sent." });
  if (!process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim()) alerts.push({ tone: "warning", text: "MARKETING_UNSUBSCRIBE_SECRET is not set. Marketing sends stay off until the unsubscribe link can be signed." });
  if (!webhookConfigured) alerts.push({ tone: "warning", text: "RESEND_WEBHOOK_SECRET is not set. Delivered, bounced, complained, opened, and clicked stay unavailable. That is not zero." });
  if (context.accounts.state === "unavailable") alerts.push({ tone: "warning", text: context.accounts.reason });
  if (context.photosUnavailable) alerts.push({ tone: "warning", text: context.photosUnavailable });
  return {
    audienceSize: audienceSize(context.people),
    subscribers: subscriberCount(context.people),
    campaigns: campaigns.filter((campaign) => campaign.status !== "archived").slice(0, 8),
    upcoming: campaigns.filter((campaign) => campaign.status === "scheduled"),
    automations: automations.map((automation) => ({
      id: automation.id,
      name: automation.name,
      status: automation.status,
      description: automation.description,
    })),
    activity: activity.data ?? [],
    engagement: engagementReport({ webhookConfigured, ...counts }),
    alerts,
    settings,
    webhookConfigured,
  };
}

async function deliveryCounts() {
  const { data, error } = await db().from("marketing_deliveries").select("status,delivered_at,bounced_at,complained_at,opened_at,clicked_at");
  if (error) raiseStorage(error);
  const rows = (data ?? []) as { status: string; delivered_at: string | null; bounced_at: string | null; complained_at: string | null; opened_at: string | null; clicked_at: string | null }[];
  const { count, error: unsubError } = await db().from("marketing_subscriptions").select("id", { count: "exact", head: true }).eq("status", "unsubscribed");
  if (unsubError) raiseStorage(unsubError);
  return {
    sent: rows.filter((row) => row.status === "sent").length,
    delivered: rows.filter((row) => row.delivered_at).length,
    bounced: rows.filter((row) => row.bounced_at).length,
    complained: rows.filter((row) => row.complained_at).length,
    opened: rows.filter((row) => row.opened_at).length,
    clicked: rows.filter((row) => row.clicked_at).length,
    unsubscribed: count ?? 0,
  };
}

export async function sendTest(input: { to: string; subject: string; previewText: string; blocks: EmailBlock[]; plainText: string; actor: string }) {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!secret) throw new MarketingWriteError("Set MARKETING_UNSUBSCRIBE_SECRET before a test can include an unsubscribe link.");
  if (!apiKey) throw new MarketingWriteError("RESEND_API_KEY is not set.");
  const settings = await getSettings();
  const from = marketingFromAddress(process.env.RESEND_FROM_EMAIL, settings.fromName);
  if (typeof from !== "string") throw new MarketingWriteError(from.error);
  const token = signUnsubscribeToken({ email: input.to }, secret);
  const link = unsubscribeUrl(process.env.NEXT_PUBLIC_APP_URL || APP_ORIGIN, token);
  const person = { firstName: "", dropoffCount: null as number | null };
  const draft = { subject: input.subject, previewText: input.previewText, blocks: input.blocks, plainText: input.plainText };
  const message: ResendMessage = {
    idempotencyKey: `mkt_test_${input.to}_${Date.now()}`,
    from,
    to: input.to,
    replyTo: settings.replyTo || process.env.REPLY_TO_EMAIL || undefined,
    subject: input.subject || "Test from Yours,",
    html: renderMarketingHtml({ draft, person, previewText: input.previewText, unsubscribeUrl: link, physicalAddress: settings.physicalAddress, hoursLabel: RETAIL_HOURS_LABEL }),
    text: renderMarketingText({ draft, person, unsubscribeUrl: link, physicalAddress: settings.physicalAddress, hoursLabel: RETAIL_HOURS_LABEL }),
    headers: listUnsubscribeHeaders(link),
    tags: [{ name: "kind", value: "marketing_test" }],
  };
  const [result] = await sendResendMessages({ apiKey, messages: [message] });
  await audit(input.actor, "campaign.test_sent", "test", input.to, { ok: result?.ok ?? false });
  if (!result?.ok) throw new MarketingWriteError(result?.error || "The test could not be sent.");
  return { id: result.resendId };
}

export async function runDueSends(now = new Date()) {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!secret || !apiKey) {
    return { sent: 0, skipped: 0, failed: 0, held: "Marketing sends are off until RESEND_API_KEY and MARKETING_UNSUBSCRIBE_SECRET are set." };
  }
  const settings = await getSettings();
  const from = marketingFromAddress(process.env.RESEND_FROM_EMAIL, settings.fromName);
  if (typeof from !== "string") return { sent: 0, skipped: 0, failed: 0, held: from.error };
  const context = await loadContext();
  await enrollDueAutomations(context.people, now);
  await queueDueAutomationSends(context.people, settings, now);
  await promoteDueCampaigns(now);
  const pending = await claimPending(now);
  const peopleByEmail = new Map(context.people.map((person) => [person.email, person]));
  const recentSends = await sentMap(now, settings.frequencyCapDays);
  const cap = { count: settings.frequencyCapCount, windowDays: settings.frequencyCapDays };
  const messages: ResendMessage[] = [];
  const claimedIds: string[] = [];
  let skipped = 0;
  for (const row of pending) {
    const person = peopleByEmail.get(row.email);
    const consentOk = Boolean(person && person.subscriptionStatus === "subscribed" && person.consentedAt && person.emailValid && !person.suppressionReason);
    if (!person || !consentOk) {
      await db().from("marketing_deliveries").update({
        status: "skipped",
        skip_reason: "Consent, suppression, or the address changed before the send.",
        updated_at: now.toISOString(),
      }).eq("id", row.id);
      skipped += 1;
      continue;
    }
    if (frequencyCapBlocks(recentSends.get(person.email) ?? [], now, cap)) {
      await db().from("marketing_deliveries").update({
        status: "pending",
        updated_at: now.toISOString(),
      }).eq("id", row.id);
      continue;
    }
    const token = signUnsubscribeToken({ email: row.email, campaignId: row.campaign_id ?? undefined, deliveryId: row.id }, secret);
    const link = unsubscribeUrl(process.env.NEXT_PUBLIC_APP_URL || APP_ORIGIN, token);
    const draft = {
      subject: row.subject,
      previewText: row.preview_text,
      blocks: row.blocks ?? [],
      plainText: row.plain_text ?? "",
    };
    messages.push({
      idempotencyKey: row.idempotency_key,
      from,
      to: row.email,
      replyTo: settings.replyTo || process.env.REPLY_TO_EMAIL || undefined,
      subject: applyPersonalization(draft.subject, personalizationFor(person)),
      html: renderMarketingHtml({
        draft,
        person: personalizationFor(person),
        previewText: draft.previewText,
        unsubscribeUrl: link,
        physicalAddress: settings.physicalAddress,
        hoursLabel: RETAIL_HOURS_LABEL,
      }),
      text: renderMarketingText({
        draft,
        person: personalizationFor(person),
        unsubscribeUrl: link,
        physicalAddress: settings.physicalAddress,
        hoursLabel: RETAIL_HOURS_LABEL,
      }),
      headers: listUnsubscribeHeaders(link),
      tags: [{ name: "kind", value: "marketing" }, { name: "delivery_id", value: row.id }],
    });
    claimedIds.push(row.id);
  }
  const outcomes = await sendResendMessages({ apiKey, messages });
  let sent = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    const row = pending.find((candidate) => candidate.idempotency_key === outcome.idempotencyKey);
    if (!row) continue;
    if (outcome.ok) {
      sent += 1;
      await db().from("marketing_deliveries").update({
        status: "sent",
        resend_id: outcome.resendId,
        sent_at: now.toISOString(),
        attempts: row.attempts + 1,
        updated_at: now.toISOString(),
      }).eq("id", row.id);
      if (row.enrollment_id) {
        await db().from("marketing_enrollments").update({ status: "sent", sent_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", row.enrollment_id);
      }
    } else {
      failed += 1;
      await db().from("marketing_deliveries").update({
        status: "failed",
        last_error: outcome.error,
        attempts: row.attempts + 1,
        updated_at: now.toISOString(),
      }).eq("id", row.id);
    }
  }
  await refreshCampaignStatuses();
  return { sent, skipped, failed, held: null as string | null, considered: claimedIds.length };
}

type PendingDelivery = {
  id: string;
  email: string;
  campaign_id: string | null;
  enrollment_id: string | null;
  idempotency_key: string;
  attempts: number;
  status: "pending" | "sending" | "sent" | "failed" | "skipped" | "cancelled";
  updated_at: string | null;
  subject: string;
  preview_text: string;
  blocks: EmailBlock[];
  plain_text: string;
};

async function claimPending(now: Date): Promise<PendingDelivery[]> {
  const { data, error } = await db().from("marketing_deliveries").select("id,email,campaign_id,enrollment_id,idempotency_key,attempts,status,updated_at").in("status", ["pending", "failed", "sending"]).limit(200);
  if (error) raiseStorage(error);
  const ready = ((data ?? []) as Omit<PendingDelivery, "subject" | "preview_text" | "blocks" | "plain_text">[])
    .filter((row) => deliveryShouldSend({ email: row.email, status: row.status, updatedAt: row.updated_at, attempts: row.attempts }, now))
    .slice(0, SEND_BATCH_LIMIT);
  const full: PendingDelivery[] = [];
  for (const row of ready) {
    const content = await contentForDelivery(row);
    if (!content) continue;
    await db().from("marketing_deliveries").update({ status: "sending", updated_at: now.toISOString() }).eq("id", row.id).eq("status", row.status);
    full.push({ ...row, ...content, status: "sending" });
  }
  return full;
}

async function contentForDelivery(row: { campaign_id: string | null; enrollment_id: string | null }) {
  if (row.campaign_id) {
    const { data, error } = await db().from("marketing_campaigns").select("subject,preview_text,blocks,plain_text,status").eq("id", row.campaign_id).maybeSingle();
    if (error) raiseStorage(error);
    const campaign = data as { subject: string; preview_text: string; blocks: EmailBlock[]; plain_text: string; status: CampaignStatus } | null;
    if (!campaign || campaign.status === "paused" || campaign.status === "draft" || campaign.status === "archived") return null;
    return { subject: campaign.subject, preview_text: campaign.preview_text, blocks: campaign.blocks, plain_text: campaign.plain_text };
  }
  if (!row.enrollment_id) return null;
  const { data, error } = await db().from("marketing_enrollments").select("automation_id,status").eq("id", row.enrollment_id).maybeSingle();
  if (error) raiseStorage(error);
  const enrollment = data as { automation_id: string; status: string } | null;
  if (!enrollment || enrollment.status !== "waiting") return null;
  const automation = await getAutomation(enrollment.automation_id);
  if (!automation || automation.status !== "active") return null;
  return { subject: automation.subject, preview_text: automation.previewText, blocks: automation.blocks, plain_text: automation.plainText };
}

async function promoteDueCampaigns(now: Date) {
  const campaigns = await listCampaigns();
  for (const campaign of campaigns) {
    if (!campaignIsDue(campaign, now)) continue;
    if (campaign.status === "scheduled") await setCampaignStatus(campaign.id, "sending", "daily-check", "campaign.sending");
  }
}

async function refreshCampaignStatuses() {
  const campaigns = await listCampaigns();
  for (const campaign of campaigns) {
    if (campaign.status !== "sending" && campaign.status !== "scheduled") continue;
    const deliveries = await listDeliveries(campaign.id);
    const counts = { pending: 0, sending: 0, sent: 0, failed: 0 };
    for (const row of deliveries as { status: string }[]) {
      if (row.status === "pending") counts.pending += 1;
      else if (row.status === "sending") counts.sending += 1;
      else if (row.status === "sent") counts.sent += 1;
      else if (row.status === "failed") counts.failed += 1;
    }
    const next = nextCampaignStatus(counts, campaign.status);
    if (next !== campaign.status) await setCampaignStatus(campaign.id, next, "daily-check", `campaign.${next}`);
  }
}

async function enrollDueAutomations(people: MarketingPerson[], now: Date) {
  const automations = await listAutomations();
  for (const automation of automations) {
    if (automation.status !== "active" || !automation.id) continue;
    const { data, error } = await db().from("marketing_enrollments").select("email,generation,status,enrolled_at,sent_at").eq("automation_id", automation.id);
    if (error) raiseStorage(error);
    const existing = ((data ?? []) as { email: string; generation: number; status: EnrollmentRecord["status"]; enrolled_at: string; sent_at: string | null }[]).map((row) => ({
      email: row.email,
      generation: row.generation,
      status: row.status,
      enrolledAt: row.enrolled_at,
      sentAt: row.sent_at,
    }));
    const candidates = enrollmentCandidates({ automation, people, existing, now }).slice(0, 50);
    if (candidates.length === 0) continue;
    const { error: insertError } = await db().from("marketing_enrollments").insert(candidates.map((candidate) => ({
      automation_id: automation.id,
      customer_id: candidate.customerId,
      email: candidate.email,
      generation: candidate.generation,
      status: "waiting",
      event_at: candidate.eventAt,
      due_at: candidate.dueAt,
    })));
    if (insertError && !/duplicate|unique/i.test(insertError.message)) raiseStorage(insertError);
  }
}

async function queueDueAutomationSends(people: MarketingPerson[], settings: MarketingSettings, now: Date) {
  const { data, error } = await db().from("marketing_enrollments").select("id,automation_id,email,status,due_at,enrolled_at").eq("status", "waiting").lte("due_at", now.toISOString()).limit(50);
  if (error) raiseStorage(error);
  const peopleByEmail = new Map(people.map((person) => [person.email, person]));
  const sent = await sentMap(now, settings.frequencyCapDays);
  for (const row of (data ?? []) as { id: string; automation_id: string; email: string; due_at: string; enrolled_at: string }[]) {
    const automation = await getAutomation(row.automation_id);
    const person = peopleByEmail.get(row.email);
    if (!automation || !person) continue;
    const decision = recheckBeforeSend({
      automation,
      person,
      dueAt: row.due_at,
      enrolledAt: row.enrolled_at,
      now,
      marketingSentAt: sent.get(row.email) ?? [],
      cap: { count: settings.frequencyCapCount, windowDays: settings.frequencyCapDays },
    });
    if (decision.action === "exit") {
      await db().from("marketing_enrollments").update({ status: "exited", exit_reason: decision.reason, exited_at: now.toISOString(), updated_at: now.toISOString() }).eq("id", row.id);
      continue;
    }
    if (decision.action === "wait") continue;
    const { error: insertError } = await db().from("marketing_deliveries").insert({
      enrollment_id: row.id,
      customer_id: person.customerId,
      email: row.email,
      status: "pending",
      idempotency_key: deliveryIdempotencyKey({ enrollmentId: row.id }, row.email),
    });
    if (insertError && !/duplicate|unique/i.test(insertError.message)) raiseStorage(insertError);
  }
}

async function sentMap(now: Date, windowDays: number) {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
  const { data, error } = await db().from("marketing_deliveries").select("email,sent_at").eq("status", "sent").gte("sent_at", since);
  if (error) raiseStorage(error);
  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as { email: string; sent_at: string | null }[]) {
    if (!row.sent_at) continue;
    const list = map.get(row.email) ?? [];
    list.push(row.sent_at);
    map.set(row.email, list);
  }
  return map;
}

export async function recordWebhook(providerId: string, payload: unknown, notice: import("@/lib/marketing/webhook").DeliveryNotice) {
  const seen = await db().from("marketing_events").select("id").eq("provider_id", providerId).maybeSingle();
  if (seen.error) raiseStorage(seen.error);
  if (seen.data) return { duplicate: true };
  const { patchForNotice, suppressionForNotice } = await import("@/lib/marketing/webhook");
  const now = new Date().toISOString();
  const patch = patchForNotice(notice, now);
  const update: { updated_at: string; delivered_at?: string; bounced_at?: string; complained_at?: string; opened_at?: string; clicked_at?: string } = { updated_at: now };
  if (patch.deliveredAt) update.delivered_at = patch.deliveredAt;
  if (patch.bouncedAt) update.bounced_at = patch.bouncedAt;
  if (patch.complainedAt) update.complained_at = patch.complainedAt;
  if (patch.openedAt) update.opened_at = patch.openedAt;
  if (patch.clickedAt) update.clicked_at = patch.clickedAt;
  let query = db().from("marketing_deliveries").update(update);
  query = notice.deliveryId ? query.eq("id", notice.deliveryId) : query.eq("resend_id", notice.resendId);
  const { data, error } = await query.select("email").limit(1);
  if (error) raiseStorage(error);
  const email = notice.email || (data?.[0] as { email?: string } | undefined)?.email;
  const reason = suppressionForNotice(notice);
  if (email && reason) {
    await setConsent({ email, customerId: null, status: "suppressed", reason, source: "resend_webhook", actor: null });
  }
  const { error: eventError } = await db().from("marketing_events").insert({
    provider_id: providerId,
    type: notice.eventType,
    email: email ?? notice.email,
    delivery_id: notice.deliveryId,
    payload,
  });
  if (eventError && !/duplicate|unique/i.test(eventError.message)) raiseStorage(eventError);
  return { duplicate: false };
}

export async function campaignReport(id: string) {
  const found = await getCampaign(id);
  if (!found) return null;
  const rows = found.deliveries as {
    status: string;
    email: string;
    delivered_at: string | null;
    bounced_at: string | null;
    complained_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    last_error: string | null;
    skip_reason: string | null;
  }[];
  const settings = await getSettings();
  const webhookConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim());
  const clicks = webhookConfigured
    ? rows.filter((row) => row.clicked_at).map((row) => ({ email: row.email, at: row.clicked_at as string }))
    : null;
  const { attributeDropoffs } = await import("@/lib/marketing/metrics");
  const { data, error } = await db().from("film_orders").select("customer_email,created_at").not("customer_email", "is", null).limit(5000);
  if (error) raiseStorage(error);
  const orders = ((data ?? []) as { customer_email: string; created_at: string }[]).map((row) => ({
    email: normalizeEmail(row.customer_email),
    at: row.created_at,
  }));
  return {
    campaign: found.campaign,
    counts: {
      pending: rows.filter((row) => row.status === "pending").length,
      sending: rows.filter((row) => row.status === "sending").length,
      sent: rows.filter((row) => row.status === "sent").length,
      failed: rows.filter((row) => row.status === "failed").length,
      skipped: rows.filter((row) => row.status === "skipped").length,
      cancelled: rows.filter((row) => row.status === "cancelled").length,
    },
    failures: rows.filter((row) => row.status === "failed").map((row) => ({ email: row.email, error: row.last_error })),
    skipped: rows.filter((row) => row.status === "skipped").map((row) => ({ email: row.email, reason: row.skip_reason })),
    engagement: engagementReport({
      webhookConfigured,
      sent: rows.filter((row) => row.status === "sent").length,
      delivered: rows.filter((row) => row.delivered_at).length,
      bounced: rows.filter((row) => row.bounced_at).length,
      complained: rows.filter((row) => row.complained_at).length,
      unsubscribed: 0,
      opened: rows.filter((row) => row.opened_at).length,
      clicked: rows.filter((row) => row.clicked_at).length,
    }),
    conversions: attributeDropoffs({
      webhookConfigured,
      clicks,
      orders,
      windowDays: settings.attributionWindowDays,
    }),
  };
}

export async function automationHistory(id: string) {
  const automation = await getAutomation(id);
  if (!automation) return null;
  const { data, error } = await db().from("marketing_enrollments").select("id,email,status,due_at,enrolled_at,sent_at,exit_reason").eq("automation_id", id).order("enrolled_at", { ascending: false }).limit(100);
  if (error) raiseStorage(error);
  return { automation, enrollments: data ?? [] };
}

export { SEND_BATCH_LIMIT };
