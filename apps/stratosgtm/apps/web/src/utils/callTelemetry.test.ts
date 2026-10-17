import { describe, it, expect, vi } from 'vitest';
import {
  CallTelemetry,
  VOICE_ACTIVITY_RMS_THRESHOLD,
  type AgentMessage,
  type TelemetryBatch,
  type TurnMetric
} from './callTelemetry';
import fixtureJson from './__fixtures__/live-call-2026-09-18.json';

/**
 * The live socket is untestable in CI — it needs a real AssemblyAI session, a
 * microphone and a human. So this is where the measurement contract is pinned
 * down: scripted event sequences on a clock we own, plus a replay of one real
 * recorded call.
 */

function makeTelemetry(opts: Partial<ConstructorParameters<typeof CallTelemetry>[0]> = {}) {
  return new CallTelemetry({
    callId: 'call-1',
    clock: () => 0,
    startedAtEpoch: 1_700_000_000_000,
    ...opts
  });
}

function drive(t: CallTelemetry, script: Array<[number, AgentMessage]>) {
  for (const [at, msg] of script) t.handleAgentMessage(msg, at);
}

/** Close the call and return every turn, so tests can inspect in-progress turns. */
function finish(t: CallTelemetry, at = 1_000_000): TurnMetric[] {
  return t.finalize('test', at).turns;
}

describe('greeting time-to-first-audio', () => {
  it('measures TTFA from session.update to the first greeting audio frame', () => {
    const t = makeTelemetry();
    t.markSessionUpdateSent(1000);
    drive(t, [
      [1100, { type: 'reply.started' }],
      [1400, { type: 'reply.audio' }],
      [1410, { type: 'reply.audio' }],
      [2200, { type: 'reply.done' }]
    ]);
    expect(t.greetingTimeToFirstAudioMs).toBe(400);
  });

  it('attributes audio arriving before any input.speech.stopped to the greeting, not turn 0', () => {
    const t = makeTelemetry();
    t.markSessionUpdateSent(1000);
    drive(t, [
      [1100, { type: 'reply.started' }],
      [1400, { type: 'reply.audio' }],
      [2200, { type: 'reply.done' }]
    ]);
    expect(t.turnCount).toBe(0);

    t.markUserVoiceActivity(4900);
    drive(t, [
      [5000, { type: 'input.speech.stopped' }],
      [5100, { type: 'reply.started' }],
      [5300, { type: 'reply.audio' }],
      [6000, { type: 'reply.done' }]
    ]);

    const turns = finish(t);
    expect(turns).toHaveLength(1);
    expect(turns[0].turnIndex).toBe(0);
    expect(turns[0].postEndpointLatencyMs).toBe(300);
    expect(t.snapshot().greetingTtfaMs).toBe(400);
  });

  it('reports a null TTFA rather than guessing when no greeting audio arrives', () => {
    const t = makeTelemetry();
    t.markSessionUpdateSent(1000);
    drive(t, [[2000, { type: 'reply.done' }]]);
    expect(t.snapshot().greetingTtfaMs).toBeNull();
  });

  it('treats a second reply before any user turn as a greeting segment, not an unattributed reply', () => {
    const t = makeTelemetry();
    t.markSessionUpdateSent(0);
    drive(t, [
      [100, { type: 'reply.started', reply_id: 'g1' }],
      [110, { type: 'reply.audio' }],
      [800, { type: 'reply.done' }],
      [1000, { type: 'reply.started', reply_id: 'g2' }],
      [1300, { type: 'reply.audio' }],
      [1900, { type: 'reply.done' }]
    ]);
    expect(t.turnCount).toBe(0);
    expect(t.snapshot().unattributedReplies).toBe(0);
    expect(t.snapshot().greetingTtfaMs).toBe(110);
  });
});

describe('user-perceived latency (the headline) vs the endpointing wait', () => {
  it('measures last voiced mic frame -> first agent audio, and splits out the endpointing delay', () => {
    const t = makeTelemetry();
    t.markUserVoiceActivity(1000);
    t.markUserVoiceActivity(1900); // last voiced frame
    drive(t, [
      [2900, { type: 'input.speech.stopped' }], // server endpoints 1000ms later
      [2950, { type: 'reply.started' }],
      [2958, { type: 'reply.audio' }],
      [4000, { type: 'reply.done' }]
    ]);

    const [turn] = finish(t);
    expect(turn.userPerceivedLatencyMs).toBe(1058);
    expect(turn.endpointingDelayMs).toBe(1000);
    expect(turn.postEndpointLatencyMs).toBe(58);
    // The narrow interval must not be mistaken for the headline.
    expect(turn.userPerceivedLatencyMs).toBe(
      (turn.endpointingDelayMs as number) + (turn.postEndpointLatencyMs as number)
    );
    expect(turn.userPerceivedLatencyMs).toBeGreaterThan(turn.postEndpointLatencyMs as number);
  });

  it('leaves the headline null when no voiced frame was seen — it never falls back to speech.stopped', () => {
    const t = makeTelemetry();
    drive(t, [
      [2900, { type: 'input.speech.stopped' }],
      [2958, { type: 'reply.audio' }],
      [4000, { type: 'reply.done' }]
    ]);
    const [turn] = finish(t);
    expect(turn.userPerceivedLatencyMs).toBeNull();
    expect(turn.endpointingDelayMs).toBeNull();
    expect(turn.postEndpointLatencyMs).toBe(58);
  });

  it('does not reuse a voiced frame that belongs to the previous turn', () => {
    const t = makeTelemetry();
    t.markUserVoiceActivity(900);
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1100, { type: 'reply.audio' }],
      [1500, { type: 'reply.done' }],
      [1600, { type: 'input.speech.started' }],
      // The user is heard again only as noise below the threshold — no voiced frame.
      [2600, { type: 'input.speech.stopped' }],
      [2700, { type: 'reply.audio' }],
      [3000, { type: 'reply.done' }]
    ]);
    const turns = finish(t);
    expect(turns[0].userPerceivedLatencyMs).toBe(200);
    expect(turns[1].userPerceivedLatencyMs).toBeNull();
  });

  it('ignores a voiced frame that arrives after speech.stopped when anchoring the turn', () => {
    const t = makeTelemetry();
    t.markUserVoiceActivity(1000);
    drive(t, [[2000, { type: 'input.speech.stopped' }]]);
    t.markUserVoiceActivity(2050); // a noise spike after the endpoint
    drive(t, [
      [2300, { type: 'reply.audio' }],
      [3000, { type: 'reply.done' }]
    ]);
    const [turn] = finish(t);
    expect(turn.userPerceivedLatencyMs).toBe(1300);
    expect(turn.endpointingDelayMs).toBe(1000);
  });

  it('only marks voice at or above the documented RMS threshold', () => {
    const t = makeTelemetry();
    t.observeMicLevel(VOICE_ACTIVITY_RMS_THRESHOLD - 0.001, 1000);
    drive(t, [
      [2000, { type: 'input.speech.stopped' }],
      [2100, { type: 'reply.audio' }]
    ]);
    expect(finish(t)[0].userPerceivedLatencyMs).toBeNull();

    const u = makeTelemetry();
    u.observeMicLevel(VOICE_ACTIVITY_RMS_THRESHOLD, 1000);
    drive(u, [
      [2000, { type: 'input.speech.stopped' }],
      [2100, { type: 'reply.audio' }]
    ]);
    expect(finish(u)[0].userPerceivedLatencyMs).toBe(1100);
  });
});

describe('generation latency and re-anchoring', () => {
  it('measures generation latency from reply.started', () => {
    const t = makeTelemetry();
    t.markUserVoiceActivity(2500);
    drive(t, [
      [3000, { type: 'input.speech.stopped' }],
      [3250, { type: 'reply.started' }],
      [3600, { type: 'reply.audio' }],
      [3640, { type: 'reply.audio' }],
      [4500, { type: 'reply.done' }]
    ]);
    const [turn] = finish(t);
    expect(turn.postEndpointLatencyMs).toBe(600);
    expect(turn.generationLatencyMs).toBe(350);
    expect(turn.interrupted).toBe(false);
  });

  it('leaves generation latency null when reply.started never arrives', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1500, { type: 'reply.audio' }],
      [2000, { type: 'reply.done' }]
    ]);
    const [turn] = finish(t);
    expect(turn.postEndpointLatencyMs).toBe(500);
    expect(turn.generationLatencyMs).toBeNull();
  });

  it('re-anchors on a repeated speech.stopped instead of opening a dead turn', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1200, { type: 'input.speech.stopped' }],
      [1500, { type: 'reply.audio' }],
      [2000, { type: 'reply.done' }]
    ]);
    const turns = finish(t);
    expect(turns).toHaveLength(1);
    expect(turns[0].postEndpointLatencyMs).toBe(300);
  });
});

describe('one turn, several replies (segments)', () => {
  it('counts follow-up replies as segments of the same turn, measured from the first audio', () => {
    const t = makeTelemetry();
    t.markUserVoiceActivity(1000);
    drive(t, [
      [2000, { type: 'input.speech.stopped' }],
      [2010, { type: 'reply.started', reply_id: 'a' }],
      [2020, { type: 'reply.audio' }],
      [3000, { type: 'reply.done', status: 'completed' }],
      [3000, { type: 'reply.started', reply_id: 'b' }],
      [3005, { type: 'reply.audio' }],
      [4000, { type: 'reply.done', status: 'completed' }],
      [4000, { type: 'reply.started', reply_id: 'c' }],
      [4010, { type: 'reply.audio' }],
      [6000, { type: 'reply.done', status: 'completed' }]
    ]);

    expect(t.turnCount).toBe(1);
    expect(t.snapshot().unattributedReplies).toBe(0);
    const [turn] = finish(t);
    expect(turn.segmentCount).toBe(3);
    expect(turn.userPerceivedLatencyMs).toBe(1020); // first audio only
    expect(turn.generationLatencyMs).toBe(10);
  });

  it('does not create a turn or a segment from a duplicate reply.started', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1100, { type: 'reply.started', reply_id: 'a' }],
      [1150, { type: 'reply.started', reply_id: 'a' }],
      [1180, { type: 'reply.started' }],
      [1400, { type: 'reply.audio' }],
      [2000, { type: 'reply.done' }]
    ]);
    const turns = finish(t);
    expect(turns).toHaveLength(1);
    expect(turns[0].segmentCount).toBe(1);
    // The first reply.started wins: a duplicate must not shorten the measurement.
    expect(turns[0].generationLatencyMs).toBe(300);
  });

  it('does not create a turn from out-of-order reply.done', () => {
    const t = makeTelemetry();
    drive(t, [
      [500, { type: 'reply.done' }],
      [600, { type: 'reply.done' }]
    ]);
    expect(t.turnCount).toBe(0);
  });

  it('counts a reply that begins with no turn open, past the greeting, as unattributed', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1100, { type: 'reply.audio' }],
      [1500, { type: 'reply.done' }],
      [1600, { type: 'input.speech.started' }], // turn 0 ends here
      // The agent speaks again with no speech.stopped in between.
      [1700, { type: 'reply.started', reply_id: 'x' }],
      [1800, { type: 'reply.audio' }],
      [2200, { type: 'reply.done' }]
    ]);
    expect(t.snapshot().unattributedReplies).toBe(1);
    expect(finish(t)).toHaveLength(1);
  });
});

describe('interruptions', () => {
  it('counts a barge-in only when the reply is confirmed interrupted, and records its offset', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1400, { type: 'reply.audio' }],
      [1900, { type: 'input.speech.started' }],
      [1902, { type: 'reply.done', status: 'interrupted' }],
      // Agent is silent now; normal user speech is not a barge-in.
      [2500, { type: 'input.speech.started' }],
      [3000, { type: 'input.speech.stopped' }],
      [3400, { type: 'reply.audio' }],
      [4000, { type: 'reply.done' }]
    ]);

    expect(t.interruptions).toBe(1);
    const turns = finish(t);
    expect(turns).toHaveLength(2);
    expect(turns[0].interrupted).toBe(true);
    expect(turns[0].bargeInOffsetMs).toBe(500);
    expect(turns[1].interrupted).toBe(false);
    expect(turns[1].bargeInOffsetMs).toBeNull();
  });

  it('does not count status=interrupted when the user was not speaking', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1400, { type: 'reply.audio' }],
      [1900, { type: 'reply.done', status: 'interrupted' }]
    ]);
    expect(t.interruptions).toBe(0);
    expect(finish(t)[0].interrupted).toBe(false);
  });

  it('does not count user speech over a reply that then completes normally', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1400, { type: 'reply.audio' }],
      [1900, { type: 'input.speech.started' }],
      [1905, { type: 'reply.done', status: 'completed' }]
    ]);
    expect(t.interruptions).toBe(0);
    expect(finish(t)[0].interrupted).toBe(false);
  });

  it('counts a barge-in once even if speech.started repeats before reply.done', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1400, { type: 'reply.audio' }],
      [1900, { type: 'input.speech.started' }],
      [1950, { type: 'input.speech.started' }],
      [2000, { type: 'reply.done', status: 'interrupted' }]
    ]);
    expect(t.interruptions).toBe(1);
    expect(finish(t)[0].bargeInOffsetMs).toBe(500);
  });

  it('keeps a barge-in over the GREETING separate: not in interruptionCount, not on any turn', () => {
    const t = makeTelemetry();
    t.markSessionUpdateSent(0);
    drive(t, [
      [300, { type: 'reply.audio' }],
      [900, { type: 'input.speech.started' }],
      [902, { type: 'reply.done', status: 'interrupted' }]
    ]);
    expect(t.interruptions).toBe(0);
    expect(t.turnCount).toBe(0);
    expect(t.snapshot().greetingBargeInOffsetMs).toBe(600);
  });

  it('does not let the barge-in confirmation arrive after the turn has been flushed', () => {
    const batches: TelemetryBatch[] = [];
    const t = makeTelemetry({ flushEveryTurns: 1, onFlush: (b) => batches.push(b) });
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1400, { type: 'reply.audio' }],
      [1900, { type: 'input.speech.started' }]
    ]);
    // Turn 0 is closed but its interrupt is unconfirmed: it must not ship yet.
    expect(batches).toHaveLength(0);
    drive(t, [[1902, { type: 'reply.done', status: 'interrupted' }]]);
    expect(batches).toHaveLength(1);
    expect(batches[0].turns[0].interrupted).toBe(true);
  });
});

describe('tool calls', () => {
  it('measures tool.call -> markToolResult within the open turn', () => {
    const t = makeTelemetry();
    t.handleAgentMessage({ type: 'input.speech.stopped' }, 1000);
    t.handleAgentMessage({ type: 'tool.call', call_id: 'tc-1', name: 'create_lead' }, 1200);
    t.markToolResult('tc-1', 1700);
    t.handleAgentMessage({ type: 'reply.audio' }, 1800);
    t.handleAgentMessage({ type: 'reply.done' }, 2400);

    const [turn] = finish(t);
    expect(turn.toolCalls).toBe(1);
    expect(turn.toolLatencyMs).toBe(500);
  });
});

describe('batching and finalize', () => {
  it('flushes once the configured number of turns has settled', () => {
    const batches: TelemetryBatch[] = [];
    const t = makeTelemetry({ flushEveryTurns: 3, onFlush: (b) => batches.push(b) });

    let clock = 0;
    for (let i = 0; i < 7; i++) {
      drive(t, [
        [(clock += 100), { type: 'input.speech.stopped' }],
        [(clock += 200), { type: 'reply.audio' }],
        [(clock += 400), { type: 'reply.done' }]
      ]);
    }

    expect(batches).toHaveLength(2);
    expect(batches[0].turns.map((x) => x.turnIndex)).toEqual([0, 1, 2]);
    expect(batches[1].turns.map((x) => x.turnIndex)).toEqual([3, 4, 5]);

    const final = t.finalize('ended', 9999);
    expect(final.turns.map((x) => x.turnIndex)).toEqual([6]);
    expect(final.record.turnCount).toBe(7);
  });

  it('closes an in-flight turn on finalize and reports duration and reason', () => {
    const t = makeTelemetry();
    t.markSessionUpdateSent(0);
    t.markUserVoiceActivity(500);
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1300, { type: 'reply.audio' }]
    ]);

    const batch = t.finalize('pagehide', 5000);
    expect(batch.record.endReason).toBe('pagehide');
    expect(batch.record.durationMs).toBe(5000);
    expect(batch.record.endedAt).toBe(1_700_000_000_000 + 5000);
    expect(batch.turns).toHaveLength(1);
    expect(batch.turns[0].userPerceivedLatencyMs).toBe(800);
  });

  it('is idempotent: the first finalize wins and later events are ignored', () => {
    const t = makeTelemetry();
    drive(t, [
      [1000, { type: 'input.speech.stopped' }],
      [1300, { type: 'reply.audio' }],
      [1800, { type: 'reply.done' }]
    ]);

    const first = t.finalize('user_ended', 4000);
    t.handleAgentMessage({ type: 'input.speech.stopped' }, 4500);
    t.handleAgentMessage({ type: 'reply.audio' }, 4800);
    const second = t.finalize('ws_close', 9000);

    expect(second.record.endReason).toBe('user_ended');
    expect(second.record.durationMs).toBe(4000);
    expect(second.record.turnCount).toBe(1);
    expect(first.turns).toHaveLength(1);
    expect(second.turns).toHaveLength(0);
  });

  it('never schedules work per audio frame', () => {
    const t = makeTelemetry();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    t.markSessionUpdateSent(0);
    for (let i = 0; i < 500; i++) t.handleAgentMessage({ type: 'reply.audio' }, 100 + i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

/**
 * Replay of a REAL call: synthesized speech through the production token
 * endpoint and wss://agents.assemblyai.com, recorded 2026-09-18. Event times are
 * the browser's own receive times. The fixture holds only synthetic speech; the
 * session resume_token is redacted.
 *
 * What the fixture does NOT contain is the mic side — no RMS was recorded. The
 * one input taken from outside the file is the time the last voiced audio was
 * sent: ~17.9s after session.update, as measured by the test harness that
 * generated the speech. That is an ASSUMED anchor, so the assertion allows a
 * tolerance rather than pretending to sample-exactness.
 */
interface FixtureEvent {
  t: number;
  msg: AgentMessage;
}
const fixture = fixtureJson as unknown as { sessionUpdateAt: number; events: FixtureEvent[] };

describe('replay of a recorded live call (2026-09-18)', () => {
  const T0 = fixture.sessionUpdateAt;
  const LAST_VOICED_MS = 17_900;
  const USER_VOICE_START_MS = 8_700;

  function replay() {
    const t = makeTelemetry({ clock: () => T0 });
    t.markSessionUpdateSent(T0);

    // Interleave synthetic mic frames (every ~85ms, the real buffer size) with
    // the recorded events, in time order.
    type Item = { at: number; run: () => void };
    const items: Item[] = fixture.events.map((e) => ({
      at: e.t,
      run: () => t.handleAgentMessage(e.msg, e.t)
    }));
    for (let ms = USER_VOICE_START_MS; ms <= LAST_VOICED_MS; ms += 85) {
      items.push({ at: T0 + ms, run: () => t.observeMicLevel(0.08, T0 + ms) });
    }
    items.push({ at: T0 + LAST_VOICED_MS, run: () => t.observeMicLevel(0.08, T0 + LAST_VOICED_MS) });
    items.sort((a, b) => a.at - b.at);
    for (const item of items) item.run();

    const batch = t.finalize('replay_end', fixture.events[fixture.events.length - 1].t);
    return { t, batch };
  }

  it('is a recording of the expected shape', () => {
    expect(fixture.events.length).toBeGreaterThan(3000);
    expect(JSON.stringify(fixture)).not.toMatch(/resume_token":"(?!REDACTED)/);
  });

  it('reports the user-perceived latency (~1s), not the ~8ms post-endpoint tail', () => {
    const { batch } = replay();
    expect(batch.turns).toHaveLength(1);
    const [turn] = batch.turns;

    expect(turn.userPerceivedLatencyMs).not.toBeNull();
    expect(turn.userPerceivedLatencyMs as number).toBeGreaterThan(950);
    expect(turn.userPerceivedLatencyMs as number).toBeLessThan(1050);

    // The narrow interval that used to be presented as the headline.
    expect(turn.postEndpointLatencyMs).toBe(8);
    // The gap between them is the server's endpointing wait.
    expect(turn.endpointingDelayMs as number).toBeGreaterThan(950);
    expect(turn.userPerceivedLatencyMs).toBe(
      (turn.endpointingDelayMs as number) + (turn.postEndpointLatencyMs as number)
    );
  });

  it('models the three sequential replies as ONE turn with three segments, none unattributed', () => {
    const { batch } = replay();
    expect(batch.record.turnCount).toBe(1);
    expect(batch.turns[0].segmentCount).toBe(3);
    expect(batch.record.unattributedReplies).toBe(0);
  });

  it('measures the greeting separately (510ms) and does not present its late barge-in as a normal one', () => {
    const { batch } = replay();
    expect(batch.record.greetingTtfaMs).toBe(510);
    // speech.started only fired at ~16.9s, after the greeting had nearly ended,
    // although the user began speaking ~8.7s in: barge-in did not work here.
    expect(batch.record.greetingBargeInOffsetMs).toBe(16415);
    expect(batch.record.interruptionCount).toBe(0);
    expect(batch.turns[0].interrupted).toBe(false);
    expect(batch.turns[0].bargeInOffsetMs).toBeNull();
  });

  it('ends cleanly with the trailing session.error after the reply ignored', () => {
    const { batch } = replay();
    expect(batch.record.endReason).toBe('replay_end');
  });
});
