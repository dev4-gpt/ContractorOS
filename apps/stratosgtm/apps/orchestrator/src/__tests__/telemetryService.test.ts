import {
  percentile,
  summarizeTurns,
  validateCallPayload,
  MIN_SAMPLE_SIZE,
  MAX_TURNS_PER_CALL,
  MAX_PAYLOAD_BYTES,
  type TurnSample
} from '../services/telemetryService';

/**
 * `values` are the user-perceived (headline) latencies. The post-endpoint part
 * is deliberately tiny: that is what a real call looked like (~8ms after a ~1s
 * endpointing wait), and it is what makes any mix-up between the two visible.
 */
function turns(values: Array<number | null>): TurnSample[] {
  return values.map((v, i) => ({
    userPerceivedLatencyMs: v,
    endpointingDelayMs: v === null ? null : v - 10,
    postEndpointLatencyMs: 10,
    generationLatencyMs: v === null ? null : 5,
    interrupted: i % 10 === 0
  }));
}

describe('percentile', () => {
  it('uses nearest rank, so every reported value is one a call actually saw', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 90)).toBe(90);
    expect(percentile(values, 95)).toBe(100);
    expect(values).toContain(percentile(values, 73));
  });

  it('does not depend on input order', () => {
    const a = percentile([5, 1, 4, 2, 3], 50);
    const b = percentile([1, 2, 3, 4, 5], 50);
    expect(a).toBe(b);
    expect(a).toBe(3);
  });

  it('returns null for an empty sample instead of zero', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('ignores non-measurements rather than treating them as fast replies', () => {
    expect(percentile([100, NaN as any, -5, 200], 50)).toBe(100);
  });
});

describe('summarizeTurns — the never-quote-an-unmeasured-number gate', () => {
  it('refuses to emit percentiles below the minimum sample size', () => {
    const result = summarizeTurns({ turns: turns([100, 200, 300]) });
    expect(result.status).toBe('insufficient_data');
    if (result.status !== 'insufficient_data') throw new Error('unreachable');
    expect(result.sampleSize).toBe(3);
    expect(result.requiredSampleSize).toBe(MIN_SAMPLE_SIZE);
    expect(result.metric).toBe('userPerceivedLatencyMs');
    expect(JSON.stringify(result)).not.toContain('p95');
  });

  it('refuses at exactly one sample below the threshold', () => {
    const values = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, (_, i) => 100 + i);
    expect(summarizeTurns({ turns: turns(values) }).status).toBe('insufficient_data');
  });

  it('emits percentiles at exactly the threshold', () => {
    const values = Array.from({ length: MIN_SAMPLE_SIZE }, (_, i) => 100 + i);
    const result = summarizeTurns({ turns: turns(values) });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.sampleSize).toBe(MIN_SAMPLE_SIZE);
    // Nearest rank over 20 samples: ceil(0.5 * 20) = 10th value = 109.
    expect(result.userPerceivedLatencyMs.p50).toBe(109);
    expect(result.userPerceivedLatencyMs.min).toBe(100);
    expect(result.userPerceivedLatencyMs.max).toBe(119);
  });

  it('counts only measured turns, so unanswered turns cannot pad the sample', () => {
    const values: Array<number | null> = Array.from({ length: MIN_SAMPLE_SIZE }, () => null);
    values.push(...Array.from({ length: 5 }, (_, i) => 100 + i));
    const result = summarizeTurns({ turns: turns(values) });
    expect(result.status).toBe('insufficient_data');
    if (result.status !== 'insufficient_data') throw new Error('unreachable');
    expect(result.sampleSize).toBe(5);
  });

  it('keeps greeting TTFA in its own distribution and never pools it with turns', () => {
    const turnValues = Array.from({ length: MIN_SAMPLE_SIZE }, () => 500);
    const greetings = Array.from({ length: MIN_SAMPLE_SIZE }, () => 1500);
    const result = summarizeTurns({
      turns: turns(turnValues),
      greetingTtfaMs: greetings,
      callCount: 20
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.userPerceivedLatencyMs.p50).toBe(500);
    expect(result.userPerceivedLatencyMs.max).toBe(500);
    expect('p50' in result.greetingTtfaMs && result.greetingTtfaMs.p50).toBe(1500);
    expect(result.callCount).toBe(20);
  });

  it('gates the greeting distribution separately when there are too few calls', () => {
    const result = summarizeTurns({
      turns: turns(Array.from({ length: MIN_SAMPLE_SIZE }, () => 500)),
      greetingTtfaMs: [1200, 1300]
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.greetingTtfaMs).toEqual({
      status: 'insufficient_data',
      sampleSize: 2,
      requiredSampleSize: MIN_SAMPLE_SIZE
    });
  });

  it('reports the interruption rate over all turns', () => {
    const result = summarizeTurns({
      turns: turns(Array.from({ length: MIN_SAMPLE_SIZE }, () => 400))
    });
    if (result.status !== 'success') throw new Error('unreachable');
    // turns() marks every 10th turn interrupted: 2 of 20.
    expect(result.interruptionRate).toBe(0.1);
  });
});

describe('summarizeTurns — the headline is user-perceived latency, never the post-endpoint tail', () => {
  it('refuses to summarise when only the narrow post-endpoint interval was measured', () => {
    // 50 turns whose mic side was never measured: post-endpoint is ~8ms on every
    // one. Emitting p50=8 here is exactly the flattering number this guards against.
    const onlyNarrow: TurnSample[] = Array.from({ length: 50 }, () => ({
      userPerceivedLatencyMs: null,
      endpointingDelayMs: null,
      postEndpointLatencyMs: 8,
      generationLatencyMs: 1,
      interrupted: false
    }));
    const result = summarizeTurns({ turns: onlyNarrow });
    expect(result.status).toBe('insufficient_data');
    if (result.status !== 'insufficient_data') throw new Error('unreachable');
    expect(result.sampleSize).toBe(0);
    expect(result.metric).toBe('userPerceivedLatencyMs');
  });

  it('puts the headline at the top level and the narrow interval under components with a warning', () => {
    const result = summarizeTurns({
      turns: turns(Array.from({ length: MIN_SAMPLE_SIZE }, () => 1000))
    });
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.userPerceivedLatencyMs.p50).toBe(1000);
    expect(result.components.postEndpointLatencyMs).toMatchObject({ p50: 10 });
    expect(result.components.endpointingDelayMs).toMatchObject({ p50: 990 });
    expect(result.components.note).toMatch(/Do not quote postEndpointLatencyMs/);
    // The old, ambiguous field name must not exist anywhere in the payload.
    expect(JSON.stringify(result)).not.toContain('responseLatencyMs');
  });

  it('computes the components over the same turns as the headline', () => {
    const mixed: TurnSample[] = [
      ...turns(Array.from({ length: MIN_SAMPLE_SIZE }, () => 1000)),
      // Measurable post-endpoint but no headline: must not leak into the components.
      ...Array.from({ length: 30 }, () => ({
        userPerceivedLatencyMs: null,
        endpointingDelayMs: null,
        postEndpointLatencyMs: 8,
        generationLatencyMs: 1,
        interrupted: false
      }))
    ];
    const result = summarizeTurns({ turns: mixed });
    if (result.status !== 'success') throw new Error('unreachable');
    expect(result.sampleSize).toBe(MIN_SAMPLE_SIZE);
    expect(result.components.postEndpointLatencyMs).toMatchObject({
      sampleSize: MIN_SAMPLE_SIZE,
      p50: 10
    });
  });
});

describe('validateCallPayload', () => {
  const base = { callId: 'c1', startedAt: 1_700_000_000_000, turns: [] as unknown[] };

  it('rejects a payload over the byte cap', () => {
    const result = validateCallPayload(base, MAX_PAYLOAD_BYTES + 1);
    expect(result).toMatchObject({ ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects more than the maximum number of turns', () => {
    const many = Array.from({ length: MAX_TURNS_PER_CALL + 1 }, (_, i) => ({ turnIndex: i }));
    const result = validateCallPayload({ ...base, turns: many });
    expect(result).toMatchObject({ ok: false, status: 400, code: 'TOO_MANY_TURNS' });
  });

  it('accepts exactly the maximum number of turns', () => {
    const many = Array.from({ length: MAX_TURNS_PER_CALL }, (_, i) => ({ turnIndex: i }));
    const result = validateCallPayload({ ...base, turns: many });
    expect(result.ok).toBe(true);
  });

  it('requires a callId', () => {
    expect(validateCallPayload({ ...base, callId: '' })).toMatchObject({
      ok: false,
      code: 'INVALID_PAYLOAD'
    });
    expect(validateCallPayload(null)).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    expect(validateCallPayload([1, 2])).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
  });

  it('drops duplicate turn indexes so one bad batch cannot fail the whole insert', () => {
    const result = validateCallPayload({
      ...base,
      turns: [
        { turnIndex: 0, userPerceivedLatencyMs: 400 },
        { turnIndex: 0, userPerceivedLatencyMs: 900 },
        { turnIndex: 1, userPerceivedLatencyMs: 500 }
      ]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.turns.map((t) => t.turnIndex)).toEqual([0, 1]);
    expect(result.value.turns[0].userPerceivedLatencyMs).toBe(400);
  });

  it('carries the new latency fields and segment count through validation', () => {
    const result = validateCallPayload({
      ...base,
      turns: [
        {
          turnIndex: 0,
          userPerceivedLatencyMs: 997.4,
          endpointingDelayMs: 989,
          postEndpointLatencyMs: 8,
          generationLatencyMs: 1,
          segmentCount: 3
        }
      ]
    });
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.turns[0]).toMatchObject({
      userPerceivedLatencyMs: 997,
      endpointingDelayMs: 989,
      postEndpointLatencyMs: 8,
      segmentCount: 3
    });
  });

  it('coerces hostile field types to null instead of storing them', () => {
    const result = validateCallPayload({
      ...base,
      greetingTtfaMs: 'fast',
      turns: [{ turnIndex: 0, userPerceivedLatencyMs: -12, generationLatencyMs: { evil: true } }]
    });
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.greetingTtfaMs).toBeNull();
    expect(result.value.turns[0].userPerceivedLatencyMs).toBeNull();
    expect(result.value.turns[0].generationLatencyMs).toBeNull();
  });
});
