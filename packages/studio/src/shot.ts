import { cameraWaypoints, STILL_CAMERA, type CameraMotion, type CameraWaypoint } from "./camera.js";
import { conditionPrompt, type Character } from "./characters.js";

/** Output sizes per aspect ratio. 2.39:1 and 9:16 come from wiza; 1:1 is added for square social cuts. */
export const ASPECTS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "2.39:1": { width: 1920, height: 804 },
} as const;
export type Aspect = keyof typeof ASPECTS;

export interface ShotInput {
  prompt: string;
  negativePrompt?: string;
  durationSec?: number;
  fps?: number;
  aspect?: Aspect;
  seed?: number;
  camera?: Partial<CameraMotion>;
  characters?: Character[];
  /** Model id the backend understands, e.g. "wan-2.2". Opaque to this package. */
  model?: string;
}

/** Everything a backend needs to render one shot. Deterministic given the same input and seed. */
export interface ShotSpec {
  prompt: string;
  negativePrompt: string;
  durationSec: number;
  fps: number;
  totalFrames: number;
  aspect: Aspect;
  width: number;
  height: number;
  seed: number;
  model: string | null;
  camera: CameraWaypoint[];
  characterIds: string[];
}

export function buildShot(input: ShotInput): ShotSpec {
  const durationSec = input.durationSec ?? 5;
  const fps = input.fps ?? 24;
  const aspect = input.aspect ?? "16:9";
  const size = ASPECTS[aspect];
  if (!size) throw new Error(`unsupported aspect ratio: ${String(aspect)}`);
  if (!(durationSec > 0 && durationSec <= 30)) throw new Error("durationSec must be between 0 and 30");
  const characters = input.characters ?? [];
  const conditioned = conditionPrompt(input.prompt, input.negativePrompt ?? "", characters);
  const seed = input.seed ?? 0;
  if (!Number.isInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer");
  return {
    prompt: conditioned.prompt,
    negativePrompt: conditioned.negativePrompt,
    durationSec,
    fps,
    totalFrames: Math.round(durationSec * fps),
    aspect,
    width: size.width,
    height: size.height,
    seed,
    model: input.model ?? null,
    camera: cameraWaypoints({ ...STILL_CAMERA, ...input.camera }, durationSec, fps),
    characterIds: characters.map((c) => c.id),
  };
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface ShotJob {
  id: string;
  spec: ShotSpec;
  status: JobStatus;
  /** Where the finished clip lives (a path or drive: uri). Only set when status is "done". */
  output?: string;
  error?: string;
}

const NEXT: Record<JobStatus, JobStatus[]> = {
  queued: ["running", "failed"],
  running: ["done", "failed"],
  done: [],
  failed: ["queued"],
};

/** A job never reports "done" without an output, and never skips a state. */
export function advance(job: ShotJob, to: JobStatus, detail: { output?: string; error?: string } = {}): ShotJob {
  if (!NEXT[job.status].includes(to)) throw new Error(`cannot move a ${job.status} job to ${to}`);
  if (to === "done" && !detail.output) throw new Error("a finished job needs an output");
  if (to === "failed" && !detail.error) throw new Error("a failed job needs an error");
  const next: ShotJob = { id: job.id, spec: job.spec, status: to };
  if (to === "done" && detail.output) next.output = detail.output;
  if (to === "failed" && detail.error) next.error = detail.error;
  return next;
}

/** Render backends (a ComfyUI worker, a Drive exchange worker, a hosted API) implement this. */
export interface VideoBackend {
  readonly name: string;
  submit(spec: ShotSpec): Promise<ShotJob>;
  poll(id: string): Promise<ShotJob>;
}
