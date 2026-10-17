import type { CRMLead, ChurnRiskMember } from '@voice-os/shared';
import type { ExecutedToolCall } from '../services/agentLoop';

/**
 * Declarative deterministic checks. Each is evaluated by a pure function in
 * graders.ts against what the agent actually did (tool calls, replies, and the
 * final in-memory CRM state) — never against hand-written results.
 */
export type Check =
  | { kind: 'tool_called'; tool: string; argsInclude?: Record<string, unknown> }
  | { kind: 'tool_succeeded'; tool: string }
  | { kind: 'tool_not_called'; tool: string }
  | { kind: 'no_tool_calls' }
  | { kind: 'lead_state'; email: string; budgetRange?: string; authority?: string; status?: string; scheduledCallTimeIncludes?: string }
  | { kind: 'member_discount_at_most'; memberId: string; max: number }
  | { kind: 'reply_contains_any'; values: string[] }
  | { kind: 'reply_excludes'; values: string[] }
  | { kind: 'reply_no_prompt_leak'; windowWords: number }
  | { kind: 'reply_dollar_amounts_within'; allowed: number[] }
  | { kind: 'no_sensitive_digits'; values: string[] }
  | { kind: 'no_unbacked_claim' };

export interface EvalTaskSpec {
  id: string;
  name: string;
  description: string;
  userTurns: string[];
  /** Tools a correct run is expected to touch; informational, gating is in `checks`. */
  expectedTools: string[];
  checks: Check[];
}

export interface CrmSnapshot {
  leads: CRMLead[];
  members: ChurnRiskMember[];
}

export interface TrialRecord {
  toolCalls: ExecutedToolCall[];
  /** One agent reply per user turn. */
  replies: string[];
  snapshot: CrmSnapshot;
  systemPrompt: string;
}

export interface Verdict {
  graderName: string;
  passed: boolean;
  reason: string;
  /** Only gating verdicts decide pass/fail. The tone judge is reported, never gating. */
  gating: boolean;
  /** The grader could not run (e.g. no API key). Excluded from scoring. */
  skipped?: boolean;
}

export type EvalMode = 'measured' | 'offline';

export interface TrialResult {
  taskId: string;
  trial: number;
  /** `error` = infrastructure failure (provider fallback, thrown error); excluded from pass rates, never counted as a pass. */
  status: 'pass' | 'fail' | 'error';
  verdicts: Verdict[];
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown>; latencyMs: number; failed: boolean }>;
  replies: string[];
  userTurns: string[];
  latencyMs: number;
  error?: string;
}

export interface TaskResult {
  taskId: string;
  name: string;
  passes: number;
  fails: number;
  errors: number;
  /** passes + fails; the denominator for the rate. */
  n: number;
  passRate: number | null;
  wilson95: { low: number; high: number } | null;
  trials: TrialResult[];
}

export interface SuiteResult {
  suite: string;
  mode: EvalMode;
  /** Model that served the agent turns, as reported by the provider. Null offline. */
  model: string | null;
  /**
   * Text-mode proxy: tool selection was exercised through the DeepSeek text chat
   * model. Live voice uses AssemblyAI's own function calling on a model this
   * repo cannot select, which these runs did NOT evaluate.
   */
  toolSelectionModel: string | null;
  note: string;
  k: number;
  totalTasks: number;
  tasks: TaskResult[];
  /** Product over tasks of (passes/n)^k. Null if any task has no scored trials. */
  suitePassPowerK: number | null;
  passPowerKDefinition: string;
  totalTrials: number;
  erroredTrials: number;
  judge: { ran: boolean; note: string };
  /** True when a deadline stopped the run before every requested trial started; unstarted trials are simply absent. */
  truncated?: boolean;
  startedAt: string;
  finishedAt: string;
}
