import { runAgentTurn, type AgentLLM } from '../services/agentLoop';
import { buildChatSystemPrompt } from '../services/chatPrompt';
import { ToolDispatcher } from '../tools/dispatcher';
import { VOICE_AGENT_TOOLS } from '../tools/registry';
import { EVAL_TASKS, EVAL_PROMPT_INPUT } from './tasks';
import { gradeTrial, trialPassed } from './graders';
import { MemoryCrm } from './memoryCrm';
import { wilson, passPowerK } from './stats';
import { createStubLLM } from './stubLLM';
import { OFFLINE_FIXTURES, type OfflineFixture } from './fixtures';
import { judgeTone } from './judge';
import type { EvalMode, EvalTaskSpec, SuiteResult, TaskResult, TrialResult, Verdict } from './types';

export const SUITE_NAME = 'StratosGTM agent eval suite';
export const PASS_POWER_K_DEFINITION =
  'Product over tasks of (passes/trials)^k: the estimated chance that every task passes on all k attempts. A point estimate; read it with the per-task Wilson intervals.';

export const OFFLINE_NOTE =
  'OFFLINE: a scripted stub replayed recorded tool-call sequences through the real dispatcher and graders. This checks the harness, not any model. It is not a measured model run.';
export const MEASURED_NOTE =
  'MEASURED against the DeepSeek text chat model with the production chat prompt and tools. This is a text-mode proxy for tool selection: live voice uses AssemblyAI function calling on a model this repo cannot select, and that model was not evaluated.';

const CHAT_TEMPERATURE = 0.4;

export interface TrialOptions {
  task: EvalTaskSpec;
  trial: number;
  llm: AgentLLM;
  /** When set (measured mode) the non-gating tone judge runs with this key. */
  judgeKey?: string;
}

/** Runs one trial: all user turns through the real agent loop and dispatcher over a fresh in-memory CRM. */
export async function executeTrial(opts: TrialOptions): Promise<TrialResult> {
  const { task, trial, llm } = opts;
  const started = Date.now();
  const crm = new MemoryCrm();
  const dispatcher = new ToolDispatcher(crm, { startContentJob: () => undefined });
  const systemPrompt = buildChatSystemPrompt(EVAL_PROMPT_INPUT);
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const replies: string[] = [];
  const toolCalls: TrialResult['toolCalls'] = [];
  const base = { taskId: task.id, trial, userTurns: task.userTurns };

  try {
    for (const userText of task.userTurns) {
      history.push({ role: 'user', content: userText });
      const turn = await runAgentTurn({
        systemPrompt,
        history,
        tools: VOICE_AGENT_TOOLS,
        dispatch: (n, a) => dispatcher.dispatch(n, a),
        llm,
        temperature: CHAT_TEMPERATURE
      });
      toolCalls.push(...turn.toolCalls);
      if (turn.isFallback) {
        return { ...base, status: 'error', verdicts: [], toolCalls, replies, latencyMs: Date.now() - started, error: 'Provider returned a fallback (no key, or the API failed); this trial was not measured.' };
      }
      replies.push(turn.reply);
      history.push({ role: 'assistant', content: turn.reply });
    }
  } catch (err: any) {
    return { ...base, status: 'error', verdicts: [], toolCalls, replies, latencyMs: Date.now() - started, error: String(err?.message || err) };
  }

  const verdicts: Verdict[] = gradeTrial(task.checks, { toolCalls, replies, snapshot: crm.snapshot(), systemPrompt });
  if (opts.judgeKey) {
    const turns = task.userTurns.flatMap((u, i) => [{ speaker: 'user' as const, text: u }, { speaker: 'agent' as const, text: replies[i] ?? '' }]);
    verdicts.push(await judgeTone(task, turns, opts.judgeKey));
  }
  return { ...base, status: trialPassed(verdicts) ? 'pass' : 'fail', verdicts, toolCalls, replies, latencyMs: Date.now() - started };
}

export function summarizeTask(task: EvalTaskSpec, trials: TrialResult[]): TaskResult {
  const passes = trials.filter((t) => t.status === 'pass').length;
  const fails = trials.filter((t) => t.status === 'fail').length;
  const errors = trials.filter((t) => t.status === 'error').length;
  const n = passes + fails;
  return { taskId: task.id, name: task.name, passes, fails, errors, n, passRate: n > 0 ? passes / n : null, wilson95: wilson(passes, n), trials };
}

export function summarizeSuite(mode: EvalMode, k: number, tasks: TaskResult[], startedAt: string, model: string | null, judgeRan: boolean): SuiteResult {
  return {
    suite: SUITE_NAME,
    mode,
    model,
    toolSelectionModel: mode === 'measured' ? model : null,
    note: mode === 'measured' ? MEASURED_NOTE : OFFLINE_NOTE,
    k,
    totalTasks: tasks.length,
    tasks,
    suitePassPowerK: passPowerK(tasks.map((t) => ({ passes: t.passes, n: t.n })), k),
    passPowerKDefinition: PASS_POWER_K_DEFINITION,
    totalTrials: tasks.reduce((a, t) => a + t.trials.length, 0),
    erroredTrials: tasks.reduce((a, t) => a + t.errors, 0),
    judge: judgeRan
      ? { ran: true, note: 'Tone judge ran and is reported per trial but never gates pass/fail.' }
      : { ran: false, note: 'Tone judge did not run.' },
    startedAt,
    finishedAt: new Date().toISOString()
  };
}

export interface RunOptions {
  k: number;
  taskIds?: string[];
  /** Deadline (epoch ms). Trials not started before it are skipped so callers stay inside a serverless limit. */
  deadlineMs?: number;
}

function selectTasks(ids?: string[]): EvalTaskSpec[] {
  if (!ids || ids.length === 0) return EVAL_TASKS;
  const unknown = ids.filter((id) => !EVAL_TASKS.some((t) => t.id === id));
  if (unknown.length) throw new Error(`Unknown task id(s): ${unknown.join(', ')}`);
  return EVAL_TASKS.filter((t) => ids.includes(t.id));
}

/** Offline: only the 'pass' fixtures form the suite, one scripted run per trial. */
export async function runOfflineSuite(opts: RunOptions): Promise<SuiteResult> {
  const startedAt = new Date().toISOString();
  const results: TaskResult[] = [];
  for (const task of selectTasks(opts.taskIds)) {
    const fx = OFFLINE_FIXTURES.find((f) => f.taskId === task.id && f.expect === 'pass');
    if (!fx) throw new Error(`No offline 'pass' fixture for task ${task.id}`);
    const trials: TrialResult[] = [];
    for (let i = 1; i <= opts.k; i++) trials.push(await executeTrial({ task, trial: i, llm: createStubLLM(fx.turns) }));
    results.push(summarizeTask(task, trials));
  }
  return summarizeSuite('offline', opts.k, results, startedAt, null, false);
}

export interface FixtureCheck {
  fixture: OfflineFixture;
  outcome: TrialResult['status'];
  ok: boolean;
}

/** Every fixture must grade as it declares ('fail' fixtures prove the graders catch bad behaviour). */
export async function selfCheckFixtures(): Promise<FixtureCheck[]> {
  const out: FixtureCheck[] = [];
  for (const fixture of OFFLINE_FIXTURES) {
    const task = EVAL_TASKS.find((t) => t.id === fixture.taskId);
    if (!task) throw new Error(`Fixture references unknown task ${fixture.taskId}`);
    const r = await executeTrial({ task, trial: 1, llm: createStubLLM(fixture.turns) });
    out.push({ fixture, outcome: r.status, ok: r.status === fixture.expect });
  }
  return out;
}

/** Measured: needs a live model. `llm` is injected; see createDeepSeekLLM. */
export async function runMeasuredSuite(opts: RunOptions & { llm: AgentLLM; judgeKey?: string }): Promise<SuiteResult> {
  const startedAt = new Date().toISOString();
  let model: string | null = null;
  const recordingLlm: AgentLLM = async (req) => {
    const res = await opts.llm(req);
    if (res.model && !res.isFallback) model = res.model;
    return res;
  };
  const results: TaskResult[] = [];
  let judgeRan = false;
  let truncated = false;
  for (const task of selectTasks(opts.taskIds)) {
    const trials: TrialResult[] = [];
    for (let i = 1; i <= opts.k; i++) {
      if (opts.deadlineMs && Date.now() > opts.deadlineMs) {
        truncated = true;
        break;
      }
      const t = await executeTrial({ task, trial: i, llm: recordingLlm, judgeKey: opts.judgeKey });
      if (t.verdicts.some((v) => !v.gating && !v.skipped)) judgeRan = true;
      trials.push(t);
    }
    results.push(summarizeTask(task, trials));
  }
  return { ...summarizeSuite('measured', opts.k, results, startedAt, model, judgeRan), ...(truncated ? { truncated: true } : {}) };
}

/**
 * Adapter over the production DeepSeek service, so measured runs use the same
 * request path as /api/voice/chat. Loaded lazily: importing the service loads
 * .env into process.env, which offline runs must not do.
 */
export function createDeepSeekLLM(apiKey?: string): AgentLLM {
  return async (req) => {
    const { deepseekService } = require('../services/deepseekService');
    const c = await deepseekService.createCompletion({ temperature: req.temperature, max_tokens: 300, apiKey, messages: req.messages, tools: req.tools });
    return { content: c?.content ?? '', tool_calls: c?.tool_calls, isFallback: !!c?.isFallback, model: c?.model };
  };
}

export function formatSuite(s: SuiteResult): string {
  const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
  const lines = [`${s.suite} [mode: ${s.mode.toUpperCase()}] k=${s.k}`, s.note, ''];
  for (const t of s.tasks) {
    const w = t.wilson95 ? ` (Wilson 95%: ${pct(t.wilson95.low)}-${pct(t.wilson95.high)})` : '';
    lines.push(`  ${t.taskId.padEnd(30)} ${t.passes}/${t.n} passed${w}${t.errors ? `  [${t.errors} errored, unscored]` : ''}`);
  }
  lines.push('', `Suite pass^${s.k} = ${s.suitePassPowerK === null ? 'n/a (a task has no scored trials)' : pct(s.suitePassPowerK)}  -- ${s.passPowerKDefinition}`);
  return lines.join('\n');
}
