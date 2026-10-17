/**
 * Real voice-call telemetry.
 *
 * The audio path runs browser <-> AssemblyAI directly, so the server never sees
 * a frame and cannot time anything. Every latency this project is allowed to
 * quote has to be measured here, in the same tick that the event arrives.
 *
 * Rules this file holds to:
 *
 *  1. No React. State lives on the instance so that recording a timestamp never
 *     schedules a render.
 *  2. The clock is injected (performance.now() in production, a scripted value
 *     in tests) — the only way any of this is verifiable without a live call.
 *  3. The HEADLINE latency is `userPerceivedLatencyMs`: the client's own last
 *     voiced mic frame -> the first agent audio frame of the reply. That is the
 *     interval a person feels. `input.speech.stopped` is the SERVER's
 *     endpointing decision and arrives ~1s after the user's voice actually
 *     ended (measured against a live call), so "speech.stopped -> audio" is only
 *     the tail of the wait. It is kept, but named `postEndpointLatencyMs`, and
 *     the endpointing wait is reported separately as `endpointingDelayMs`, so
 *     the narrow number can never be mistaken for the headline.
 *  4. The greeting's time-to-first-audio is kept apart from per-turn latency and
 *     never averaged into it: it has no user utterance in front of it.
 *  5. Nothing is inferred. If a value cannot be measured (no voiced frame seen,
 *     no audio produced) it is null, never a fallback to a flattering interval.
 */

export type Clock = () => number;

/**
 * Mic RMS at or above this counts as "the user is voicing".
 *
 * The mic is captured with noiseSuppression + autoGainControl, where speech sits
 * around 0.02-0.25 RMS and suppressed background around 0.001-0.005. 0.02 sits
 * above the noise floor. It errs on the conservative side: a threshold that is
 * too HIGH treats trailing quiet syllables as silence, which moves lastVoicedAt
 * earlier and makes the measured latency LARGER — never flattering. It is a
 * reasoned value, not one tuned on a corpus of real calls.
 */
export const VOICE_ACTIVITY_RMS_THRESHOLD = 0.02;

/** The subset of the AssemblyAI event contract this class reads. */
export interface AgentMessage {
  type?: string;
  status?: string;
  call_id?: string;
  reply_id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface TurnMetric {
  turnIndex: number;
  /**
   * HEADLINE. Last voiced mic frame -> first agent audio frame of the turn.
   * = endpointingDelayMs + postEndpointLatencyMs. Measured at frame arrival, so
   * it excludes audio-output latency and includes up to one mic buffer (~85ms)
   * of over-counting the other way: treat it as an estimate of what the user
   * felt, accurate to roughly one buffer, not a sample-exact figure.
   */
  userPerceivedLatencyMs: number | null;
  /** Last voiced mic frame -> server's input.speech.stopped. */
  endpointingDelayMs: number | null;
  /**
   * input.speech.stopped -> first agent audio frame. NOT user-perceived latency:
   * it starts only after the server has already waited out the silence. Never
   * quote it on its own.
   */
  postEndpointLatencyMs: number | null;
  /** reply.started (first segment) -> first agent audio frame. */
  generationLatencyMs: number | null;
  /**
   * Replies (reply.started ... reply.done) the agent produced inside this turn.
   * One user turn can yield several; latency comes from the first audio only.
   */
  segmentCount: number;
  /** A real barge-in: user speech started while the agent was talking AND the reply was reported interrupted. */
  interrupted: boolean;
  /** First agent audio of the turn -> the user talking over it. */
  bargeInOffsetMs: number | null;
  toolCalls: number;
  toolLatencyMs: number | null;
}

export interface CallTelemetryRecord {
  callId: string;
  persona: string | null;
  companyName: string | null;
  /** Wall-clock epoch ms, for ordering rows server-side. */
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  endReason: string | null;
  /** session.update sent -> first greeting audio frame. Never pooled with turns. */
  greetingTtfaMs: number | null;
  /**
   * The user speaking over the GREETING, kept apart from turn barge-ins and NOT
   * counted in interruptionCount. It is a different situation: the greeting is
   * long, unprompted, and (observed live) barge-in detection did not fire until
   * the greeting had almost finished — 16.4s after its first audio although the
   * user began speaking ~8s in. Reporting that as an ordinary barge-in offset
   * would say barge-in works.
   */
  greetingBargeInOffsetMs: number | null;
  turnCount: number;
  /** Confirmed barge-ins during TURNS only (see greetingBargeInOffsetMs). */
  interruptionCount: number;
  /**
   * Agent replies that began with no turn open and outside the greeting — the
   * agent speaking unprompted. Counted, never attributed to a latency sample.
   */
  unattributedReplies: number;
}

export interface TelemetryBatch {
  callId: string;
  record: CallTelemetryRecord;
  turns: TurnMetric[];
}

export interface CallTelemetryOptions {
  callId: string;
  clock?: Clock;
  /** Wall-clock epoch ms of call start. Injectable for deterministic tests. */
  startedAtEpoch?: number;
  persona?: string | null;
  companyName?: string | null;
  /** Emit a batch once this many settled turns are unsent. */
  flushEveryTurns?: number;
  onFlush?: (batch: TelemetryBatch) => void;
}

interface Turn {
  turnIndex: number;
  /** Time of the previous turn's speech.stopped: voiced frames before it belong to that turn. */
  floorAt: number;
  speechStoppedAt: number;
  voicedAnchorAt: number | null;
  replyStartedAt: number | null;
  firstAudioAt: number | null;
  segmentCount: number;
  interrupted: boolean;
  bargeInOffsetMs: number | null;
  toolCalls: number;
  toolLatencyMs: number | null;
  pendingTools: Map<string, number>;
  /** The user has started speaking again; no more segments are accepted. */
  closed: boolean;
  /** Closed by a barge-in whose confirming reply.done has not arrived yet. */
  awaitingConfirm: boolean;
}

interface PendingBarge {
  at: number;
  /** null target = the greeting. */
  turn: Turn | null;
  targetFirstAudioAt: number | null;
}

const DEFAULT_FLUSH_EVERY_TURNS = 20;

export class CallTelemetry {
  public readonly callId: string;

  private readonly clock: Clock;
  private readonly persona: string | null;
  private readonly companyName: string | null;
  private readonly flushEveryTurns: number;
  private readonly onFlush?: (batch: TelemetryBatch) => void;

  private readonly startedAtEpoch: number;
  private readonly startedAtClock: number;

  private sessionUpdateAt: number | null = null;
  private lastVoicedAt: number | null = null;

  /** True until the first input.speech.stopped: every reply before it is the greeting's. */
  private greetingPhase = true;
  private greetingFirstAudioAt: number | null = null;
  private greetingTtfaMs: number | null = null;
  private greetingBargeInOffsetMs: number | null = null;

  private replyActive = false;
  private activeReplyId: string | null = null;
  private pendingBarge: PendingBarge | null = null;

  private current: Turn | null = null;
  private turns: Turn[] = [];
  private lastStoppedAt = Number.NEGATIVE_INFINITY;
  private sentTurns = 0;
  private hasDrained = false;

  private interruptionCount = 0;
  private unattributedReplies = 0;

  private endedAtClock: number | null = null;
  private endReason: string | null = null;
  private finalized = false;

  constructor(opts: CallTelemetryOptions) {
    this.callId = opts.callId;
    this.clock = opts.clock || (() => Date.now());
    this.persona = opts.persona ?? null;
    this.companyName = opts.companyName ?? null;
    this.flushEveryTurns = opts.flushEveryTurns ?? DEFAULT_FLUSH_EVERY_TURNS;
    this.onFlush = opts.onFlush;
    this.startedAtEpoch = opts.startedAtEpoch ?? Date.now();
    this.startedAtClock = this.clock();
  }

  /**
   * Call immediately BEFORE ws.send(sessionUpdate): the greeting text travels in
   * that frame, so nothing the agent says can precede it.
   */
  public markSessionUpdateSent(nowMs: number = this.clock()): void {
    if (this.sessionUpdateAt === null) this.sessionUpdateAt = nowMs;
  }

  /**
   * The user's mic carried voice in the frame that just completed. Only the
   * latest timestamp is kept, so calling it per mic buffer is one assignment.
   *
   * Frames are timestamped when their buffer COMPLETES, so the true end of the
   * voice is up to one buffer (~85ms at 2048/24kHz) earlier than this value.
   * The error therefore understates the user's wait slightly.
   *
   * Caveat: with imperfect echo cancellation the agent's own audio can leak into
   * the mic and register as "voice". That can only move lastVoicedAt later
   * (making latency look shorter) while the agent is speaking, and is not
   * something this class can detect.
   */
  public markUserVoiceActivity(nowMs: number = this.clock()): void {
    if (this.finalized) return;
    this.lastVoicedAt = nowMs;
  }

  /** Convenience for the mic callback: thresholds an RMS reading, then marks. */
  public observeMicLevel(rms: number, nowMs: number = this.clock()): void {
    if (rms >= VOICE_ACTIVITY_RMS_THRESHOLD) this.markUserVoiceActivity(nowMs);
  }

  /**
   * One call at the top of ws.onmessage, after JSON.parse. The caller should
   * take `nowMs` BEFORE parsing or decoding so that work is not charged to the
   * model.
   */
  public handleAgentMessage(msg: AgentMessage, nowMs: number = this.clock()): void {
    if (this.finalized || !msg) return;

    switch (msg.type) {
      case 'input.speech.started':
        this.onSpeechStarted(nowMs);
        return;
      case 'input.speech.stopped':
        this.onSpeechStopped(nowMs);
        return;
      case 'reply.started':
        this.onReplyStarted(typeof msg.reply_id === 'string' ? msg.reply_id : null, nowMs);
        return;
      case 'reply.audio':
        this.onReplyAudio(nowMs);
        return;
      case 'reply.done':
        this.onReplyDone(msg.status === 'interrupted');
        return;
      case 'tool.call':
        this.markToolCall(typeof msg.call_id === 'string' ? msg.call_id : null, nowMs);
        return;
      default:
        return;
    }
  }

  public markToolCall(toolCallId: string | null, nowMs: number = this.clock()): void {
    if (this.finalized) return;
    const turn = this.current;
    if (!turn) return;
    turn.toolCalls += 1;
    turn.pendingTools.set(toolCallId || `anon_${turn.toolCalls}`, nowMs);
  }

  public markToolResult(toolCallId: string | null, nowMs: number = this.clock()): void {
    if (this.finalized) return;
    const turn = this.current;
    if (!turn) return;
    const key = toolCallId || `anon_${turn.toolCalls}`;
    const startedAt = turn.pendingTools.get(key);
    if (startedAt === undefined) return;
    turn.pendingTools.delete(key);
    turn.toolLatencyMs = nowMs - startedAt;
  }

  // --------------------------------------------------------------------------
  // Event handling
  // --------------------------------------------------------------------------

  private onSpeechStarted(nowMs: number): void {
    // User speech while the agent is mid-reply is a barge-in CANDIDATE. It only
    // counts once the reply is reported interrupted (see onReplyDone): a cough
    // over the last syllable of a finished reply is not an interruption.
    if (this.replyActive && !this.pendingBarge) {
      if (this.current) {
        this.pendingBarge = {
          at: nowMs,
          turn: this.current,
          targetFirstAudioAt: this.current.firstAudioAt
        };
      } else if (this.greetingPhase) {
        this.pendingBarge = {
          at: nowMs,
          turn: null,
          targetFirstAudioAt: this.greetingFirstAudioAt
        };
      }
    }

    // A turn is everything from speech.stopped until the user speaks again.
    if (this.current) {
      const turn = this.current;
      turn.closed = true;
      turn.awaitingConfirm = this.pendingBarge?.turn === turn;
      this.current = null;
      this.maybeFlush();
    }
  }

  private onSpeechStopped(nowMs: number): void {
    // Anything still unconfirmed is dropped: if the server had interrupted the
    // reply, reply.done would have said so by now.
    this.discardPendingBarge();

    const open = this.current;
    if (open) {
      // Repeated stop before the agent answered is re-triggered VAD, not a new
      // turn: move the anchor rather than opening a turn that never gets a reply.
      if (open.segmentCount === 0 && open.firstAudioAt === null) {
        open.speechStoppedAt = nowMs;
        open.voicedAnchorAt = this.voicedAnchor(nowMs, open.floorAt);
        return;
      }
      // The agent already answered and no speech.started intervened (lost
      // event): a new stop means the user spoke again, so this is a new turn.
      open.closed = true;
      this.current = null;
    }

    this.greetingPhase = false;
    const turn: Turn = {
      turnIndex: this.turns.length,
      floorAt: this.lastStoppedAt,
      speechStoppedAt: nowMs,
      voicedAnchorAt: this.voicedAnchor(nowMs, this.lastStoppedAt),
      replyStartedAt: null,
      firstAudioAt: null,
      segmentCount: 0,
      interrupted: false,
      bargeInOffsetMs: null,
      toolCalls: 0,
      toolLatencyMs: null,
      pendingTools: new Map(),
      closed: false,
      awaitingConfirm: false
    };
    this.lastStoppedAt = nowMs;
    this.turns.push(turn);
    this.current = turn;
    this.maybeFlush();
  }

  /**
   * The last voiced frame that belongs to THIS turn: after the previous turn's
   * stop and not after this one's. Null when there is none (mic never crossed
   * the threshold) — the headline is then unmeasured, never back-filled from
   * speech.stopped.
   */
  private voicedAnchor(stoppedAt: number, floorAt: number): number | null {
    const v = this.lastVoicedAt;
    if (v === null || v <= floorAt || v > stoppedAt) return null;
    return v;
  }

  private onReplyStarted(replyId: string | null, nowMs: number): void {
    // A repeated reply.started for the reply already in progress is a duplicate,
    // not a new segment. With ids we can tell a genuine next reply apart.
    if (this.replyActive && (replyId === null || replyId === this.activeReplyId)) return;
    this.beginSegment(replyId, nowMs, true);
  }

  /**
   * `sawReplyStarted` is false when the segment is inferred from audio alone. It
   * must then leave replyStartedAt unset: stamping it with the audio's own time
   * would report a generation latency of exactly 0, a number nobody measured.
   */
  private beginSegment(replyId: string | null, nowMs: number, sawReplyStarted: boolean): void {
    this.replyActive = true;
    this.activeReplyId = replyId;

    const turn = this.current;
    if (turn) {
      turn.segmentCount += 1;
      if (sawReplyStarted && turn.replyStartedAt === null && turn.firstAudioAt === null) {
        turn.replyStartedAt = nowMs;
      }
      return;
    }
    if (this.greetingPhase) return;
    // No turn open and past the greeting: the agent is speaking unprompted.
    this.unattributedReplies += 1;
  }

  private onReplyAudio(nowMs: number): void {
    // Audio with no reply.started in front of it still opens a segment.
    if (!this.replyActive) this.beginSegment(null, nowMs, false);

    const turn = this.current;
    if (turn) {
      // Latency comes from the FIRST audio of the turn; later segments add
      // nothing to it.
      if (turn.firstAudioAt !== null) return;
      turn.firstAudioAt = nowMs;
      return;
    }

    if (this.greetingPhase && this.greetingFirstAudioAt === null) {
      this.greetingFirstAudioAt = nowMs;
      if (this.sessionUpdateAt !== null) this.greetingTtfaMs = nowMs - this.sessionUpdateAt;
    }
    // Otherwise: in-flight audio of an already-counted reply. Nothing to record.
  }

  private onReplyDone(interrupted: boolean): void {
    this.replyActive = false;
    this.activeReplyId = null;

    const barge = this.pendingBarge;
    this.pendingBarge = null;
    if (!barge) return; // status=interrupted with no user speech is not a barge-in.

    const turn = barge.turn;
    if (interrupted) {
      const offset = barge.targetFirstAudioAt === null ? null : barge.at - barge.targetFirstAudioAt;
      if (turn) {
        turn.interrupted = true;
        turn.bargeInOffsetMs = offset;
        this.interruptionCount += 1;
      } else if (this.greetingBargeInOffsetMs === null) {
        // Deliberately not added to interruptionCount. See CallTelemetryRecord.
        this.greetingBargeInOffsetMs = offset;
      }
    }
    if (turn) {
      turn.awaitingConfirm = false;
      this.maybeFlush();
    }
  }

  private discardPendingBarge(): void {
    const barge = this.pendingBarge;
    this.pendingBarge = null;
    if (barge?.turn) {
      barge.turn.awaitingConfirm = false;
      this.maybeFlush();
    }
  }

  // --------------------------------------------------------------------------
  // Readout
  // --------------------------------------------------------------------------

  private toMetric(turn: Turn): TurnMetric {
    const first = turn.firstAudioAt;
    const anchor = turn.voicedAnchorAt;
    return {
      turnIndex: turn.turnIndex,
      userPerceivedLatencyMs: first !== null && anchor !== null ? first - anchor : null,
      endpointingDelayMs: anchor !== null ? turn.speechStoppedAt - anchor : null,
      postEndpointLatencyMs: first !== null ? first - turn.speechStoppedAt : null,
      generationLatencyMs:
        first !== null && turn.replyStartedAt !== null ? first - turn.replyStartedAt : null,
      segmentCount: turn.segmentCount,
      interrupted: turn.interrupted,
      bargeInOffsetMs: turn.bargeInOffsetMs,
      toolCalls: turn.toolCalls,
      toolLatencyMs: turn.toolLatencyMs
    };
  }

  private isSettled(turn: Turn): boolean {
    return turn.closed && !turn.awaitingConfirm;
  }

  /** Turns opened so far, including one still in progress. */
  public get turnCount(): number {
    return this.turns.length;
  }

  public get interruptions(): number {
    return this.interruptionCount;
  }

  public get greetingTimeToFirstAudioMs(): number | null {
    return this.greetingTtfaMs;
  }

  public snapshot(): CallTelemetryRecord {
    const endedAtClock = this.endedAtClock;
    return {
      callId: this.callId,
      persona: this.persona,
      companyName: this.companyName,
      startedAt: this.startedAtEpoch,
      endedAt:
        endedAtClock === null ? null : this.startedAtEpoch + (endedAtClock - this.startedAtClock),
      durationMs: endedAtClock === null ? null : endedAtClock - this.startedAtClock,
      endReason: this.endReason,
      greetingTtfaMs: this.greetingTtfaMs,
      greetingBargeInOffsetMs: this.greetingBargeInOffsetMs,
      turnCount: this.turns.length,
      interruptionCount: this.interruptionCount,
      unattributedReplies: this.unattributedReplies
    };
  }

  /** Every settled turn so far. */
  public completedTurns(): TurnMetric[] {
    return this.turns.filter((t) => this.isSettled(t)).map((t) => this.toMetric(t));
  }

  /**
   * Hand back settled turns not yet shipped. The first call always returns (it
   * registers the call and its greeting TTFA); after that it returns null when
   * nothing new has settled, so a periodic flush is free on an idle call. Order
   * is preserved: a turn awaiting barge-in confirmation holds back later ones.
   */
  public drain(): TelemetryBatch | null {
    const out: TurnMetric[] = [];
    let i = this.sentTurns;
    while (i < this.turns.length && this.isSettled(this.turns[i])) {
      out.push(this.toMetric(this.turns[i]));
      i += 1;
    }
    if (out.length === 0 && this.hasDrained) return null;
    this.sentTurns = i;
    this.hasDrained = true;
    return { callId: this.callId, record: this.snapshot(), turns: out };
  }

  private maybeFlush(): void {
    if (!this.onFlush) return;
    let settled = 0;
    for (let i = this.sentTurns; i < this.turns.length && this.isSettled(this.turns[i]); i++) {
      settled += 1;
    }
    if (settled < this.flushEveryTurns) return;
    const batch = this.drain();
    if (batch) this.onFlush(batch);
  }

  /**
   * Close the call. Idempotent — the end-call button, the socket's onclose and
   * the pagehide listener all race, and the first to arrive is the honest end
   * time. Sends nothing on the socket, so it is independent of how the session
   * is ended (`session.end`).
   */
  public finalize(reason: string, nowMs: number = this.clock()): TelemetryBatch {
    if (!this.finalized) {
      this.pendingBarge = null;
      for (const t of this.turns) {
        t.closed = true;
        t.awaitingConfirm = false;
      }
      this.current = null;
      this.endedAtClock = nowMs;
      this.endReason = reason;
      this.finalized = true;
    }
    const turns: TurnMetric[] = [];
    for (let i = this.sentTurns; i < this.turns.length; i++) turns.push(this.toMetric(this.turns[i]));
    this.sentTurns = this.turns.length;
    this.hasDrained = true;
    return { callId: this.callId, record: this.snapshot(), turns };
  }

  public get isFinalized(): boolean {
    return this.finalized;
  }
}

export function createCallId(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
