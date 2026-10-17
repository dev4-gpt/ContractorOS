import { createHash } from "node:crypto";

/**
 * Contract for the content factory. The stage sequence follows the public
 * "Hermes Content Factory" workflow pattern (credit: Raja Ashok); the types,
 * code and prompts here are our own. Dates are ISO-8601 strings (UTC).
 */
export const FACTORY_PATTERN_SOURCE = "https://rajaashok.github.io/hermes-content-factory-workflow";

export const CONTENT_TYPES = ["article", "social", "email", "video", "campaign"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const STAGES = ["brief", "research", "plan", "draft", "assets", "quality", "approval", "publish"] as const;
export type Stage = (typeof STAGES)[number];

export interface StageSpec {
  id: Stage;
  owner: "client" | "agent" | "research" | "media" | "review" | "delivery";
  required: boolean;
  approvalRequired: boolean;
  output: string;
}

export const STAGE_SPECS: readonly StageSpec[] = [
  { id: "brief", owner: "client", required: true, approvalRequired: false, output: "content_brief" },
  { id: "research", owner: "research", required: true, approvalRequired: false, output: "citation_record" },
  { id: "plan", owner: "agent", required: true, approvalRequired: false, output: "content_outline" },
  { id: "draft", owner: "agent", required: true, approvalRequired: false, output: "draft_artifact" },
  { id: "assets", owner: "media", required: false, approvalRequired: false, output: "media_artifact_set" },
  { id: "quality", owner: "review", required: true, approvalRequired: false, output: "quality_report" },
  { id: "approval", owner: "review", required: true, approvalRequired: true, output: "approval_record" },
  { id: "publish", owner: "delivery", required: true, approvalRequired: true, output: "delivery_record" },
];

export type RunStatus = "queued" | "running" | "awaiting_approval" | "approved" | "published" | "failed";

export interface FactoryPlan {
  workflowId: string;
  tenantSlug: string;
  brief: string;
  contentType: ContentType;
  stages: readonly Stage[];
  /** Always false: nothing leaves the system without a human decision. */
  autoPublish: false;
  source: typeof FACTORY_PATTERN_SOURCE;
}

/** An approval is a record about one workflow, not a boolean, so it cannot be reused for another. */
export interface Approval {
  id: string;
  workflowId: string;
  tenantSlug: string;
  approvedBy: string;
  approvedAt: string;
}

export interface Citation {
  id: string;
  url: string;
  title?: string;
  retrievedAt: string;
  /** The text from the source that supports claims made in the draft. */
  evidence: string;
}

export interface QualityReport {
  id: string;
  workflowId: string;
  passed: boolean;
  /** Share of checks that passed, 0-100. Not a model opinion. */
  score: number;
  citationCount: number;
  findings: readonly string[];
  repairAttempts: number;
  checkedAt: string;
}

export interface DeliveryRecord {
  id: string;
  workflowId: string;
  destination: string;
  status: "recorded";
  approvalId: string;
  assetId: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const WORKFLOW_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,99}$/;
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function cleanBrief(brief: string): string {
  return brief.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 4000);
}

/**
 * Build a plan. The workflow id is derived from tenant, content type,
 * idempotency key and brief, so resubmitting the same request resolves to
 * the same workflow instead of creating a duplicate.
 */
export function createPlan(input: {
  tenantSlug: string;
  brief: string;
  contentType?: ContentType;
  idempotencyKey?: string;
  workflowId?: string;
}): FactoryPlan {
  const tenantSlug = input.tenantSlug.trim();
  if (!SLUG_RE.test(tenantSlug)) throw new Error("tenantSlug is invalid");
  const brief = cleanBrief(input.brief);
  if (brief.length < 12) throw new Error("content brief is too short");
  const contentType = input.contentType ?? "article";
  if (!(CONTENT_TYPES as readonly string[]).includes(contentType)) throw new Error("contentType is invalid");
  const idempotencyKey = input.idempotencyKey?.trim() || "default";
  if (!KEY_RE.test(idempotencyKey)) throw new Error("idempotencyKey is invalid");

  const digest = createHash("sha256").update(`${tenantSlug}|${contentType}|${idempotencyKey}|${brief}`).digest("hex");
  const workflowId = (input.workflowId?.trim() || `content-${tenantSlug}-${digest.slice(0, 12)}`).slice(0, 100);
  if (!WORKFLOW_RE.test(workflowId)) throw new Error("workflowId is invalid");

  return {
    workflowId,
    tenantSlug,
    brief,
    contentType,
    stages: STAGE_SPECS.map((spec) => spec.id),
    autoPublish: false,
    source: FACTORY_PATTERN_SOURCE,
  };
}

/** True only for a complete approval that names this exact workflow and tenant. */
export function canPublish(plan: FactoryPlan, approval: Approval | null | undefined): boolean {
  return (
    plan.autoPublish === false &&
    !!approval &&
    approval.id.trim().length > 0 &&
    approval.workflowId === plan.workflowId &&
    approval.tenantSlug === plan.tenantSlug &&
    approval.approvedBy.trim().length > 0 &&
    Number.isFinite(Date.parse(approval.approvedAt))
  );
}

/** System prompt for one bounded stage. Forbids publishing and invented facts. */
export function stageSystemPrompt(plan: FactoryPlan, stage: Stage): string {
  const spec = STAGE_SPECS.find((candidate) => candidate.id === stage);
  if (!spec) throw new Error(`unknown stage: ${stage}`);
  return [
    "You are operating one bounded content-factory stage.",
    `Tenant: ${plan.tenantSlug}`,
    `Workflow: ${plan.workflowId}`,
    `Stage: ${spec.id}`,
    `Required output: ${spec.output}`,
    `Content type: ${plan.contentType}`,
    "Never publish, send or contact any external destination.",
    "Use only facts present in the provided citations. Never invent statistics, quotes, customers, results or sources.",
    "If the citations do not support a claim, leave the claim out.",
  ].join("\n");
}
