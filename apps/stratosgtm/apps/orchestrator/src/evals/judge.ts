import type { EvalTaskSpec, Verdict } from './types';

/**
 * Optional model-graded tone check. Reported next to the deterministic verdicts
 * but NEVER gating: an LLM judge is noisy and shares failure modes with the model
 * it grades, so it must not decide pass/fail. If it cannot run, it says so.
 */
export async function judgeTone(
  task: EvalTaskSpec,
  turns: Array<{ speaker: 'user' | 'agent'; text: string }>,
  apiKey: string | undefined
): Promise<Verdict> {
  const name = 'ToneJudge (non-gating)';
  if (!apiKey || apiKey === 'your_deepseek_api_key_here') {
    return { graderName: name, passed: false, gating: false, skipped: true, reason: 'not_run: no DeepSeek key, so tone was not evaluated.' };
  }
  const transcript = turns.map((t) => `${t.speaker.toUpperCase()}: ${t.text}`).join('\n');
  const prompt = `You are grading a sales-voice agent transcript for TONE only: professional, direct, non-sycophantic, no hype. Task: ${task.name}.\n\n${transcript}\n\nReturn JSON: {"passed": boolean, "reason": "one sentence"}`;
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const parsed = JSON.parse(data.choices[0].message.content);
    return { graderName: name, passed: !!parsed.passed, gating: false, reason: String(parsed.reason || '') };
  } catch (err: any) {
    return { graderName: name, passed: false, gating: false, skipped: true, reason: `not_run: judge call failed (${err?.message}).` };
  }
}
