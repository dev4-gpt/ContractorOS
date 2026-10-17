/**
 * Eval CLI.
 *
 *   --offline           replay recorded tool-call fixtures through the real dispatcher
 *                       and graders. No API key, seconds. Proves the harness, NOT a model.
 *   (default)           measured run against the DeepSeek text chat model; needs
 *                       DEEPSEEK_API_KEY. Text-mode proxy for tool selection only.
 *   --k N               trials per task (default 3 measured, 2 offline)
 *   --task ID           run a single task
 *   --json FILE         write the full result as JSON
 *   --post URL          POST the result to <URL>/api/evals/runs (needs ORCHESTRATOR_API_KEY)
 *
 * Exit code is non-zero if the offline harness self-check fails, or if any scored
 * offline trial fails. A measured run reports its results and exits 0 unless it
 * could not run at all: model failures are findings, not tooling errors.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runOfflineSuite,
  runMeasuredSuite,
  selfCheckFixtures,
  createDeepSeekLLM,
  formatSuite
} from '../../../apps/orchestrator/src/evals/runner';
import type { SuiteResult } from '../../../apps/orchestrator/src/evals/types';

/**
 * `npm run eval --workspace packages/evals` runs with packages/evals as the working
 * directory, so the server's cwd-relative .env lookup never finds the repo-root file.
 * Load it by path. Variables already in the environment win (CI supplies its own).
 */
function loadRootEnv(): void {
  const file = resolve(__dirname, '../../../.env');
  if (existsSync(file) && typeof (process as any).loadEnvFile === 'function') {
    try {
      (process as any).loadEnvFile(file);
    } catch {}
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

async function post(url: string, suite: SuiteResult) {
  const key = process.env.ORCHESTRATOR_API_KEY;
  const res = await fetch(`${url.replace(/\/+$/, '')}/api/evals/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ ...suite, source: 'ci', gitSha: process.env.GITHUB_SHA })
  });
  const text = await res.text();
  console.log(`POST /api/evals/runs -> HTTP ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) process.exitCode = 1;
}

async function main() {
  const offline = flag('--offline');
  // An offline run must not touch the environment, unless it is posting (which needs ORCHESTRATOR_API_KEY).
  if (!offline || flag('--post') || arg('--post')) loadRootEnv();
  const taskId = arg('--task');
  const k = Number(arg('--k') ?? (offline ? 2 : 3));
  if (!Number.isInteger(k) || k < 1) throw new Error('--k must be a positive integer');
  const taskIds = taskId ? [taskId] : undefined;

  let suite: SuiteResult;
  if (offline) {
    const checks = await selfCheckFixtures();
    const bad = checks.filter((c) => !c.ok);
    console.log(`Harness self-check: ${checks.length - bad.length}/${checks.length} fixtures graded as declared.`);
    for (const b of bad) console.error(`  MISMATCH ${b.fixture.taskId} [${b.fixture.label}]: expected ${b.fixture.expect}, got ${b.outcome}`);
    if (bad.length) process.exitCode = 1;
    suite = await runOfflineSuite({ k, taskIds });
  } else {
    // Loading the service loads .env into process.env, exactly as the server does.
    require('../../../apps/orchestrator/src/services/deepseekService');
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key || key === 'your_deepseek_api_key_here') {
      console.error('No DEEPSEEK_API_KEY: a measured run is impossible. Use --offline for the harness check; nothing was measured.');
      process.exit(2);
    }
    suite = await runMeasuredSuite({ k, taskIds, llm: createDeepSeekLLM(key), judgeKey: key });
  }

  console.log('\n' + formatSuite(suite));
  if (offline && suite.tasks.some((t) => t.fails > 0 || t.errors > 0)) process.exitCode = 1;
  const out = arg('--json');
  if (out) writeFileSync(out, JSON.stringify(suite, null, 2));
  const url = arg('--post');
  if (url) await post(url, suite);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
