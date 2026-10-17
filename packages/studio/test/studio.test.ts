import { describe, expect, it } from "vitest";
import { advance, buildShot, cameraWaypoints, conditionPrompt, defineCharacter, STILL_CAMERA, type ShotJob } from "../src/index.js";

describe("cameraWaypoints", () => {
  it("matches wiza's formulas for a straight dolly", () => {
    const points = cameraWaypoints({ ...STILL_CAMERA, dolly: 1 }, 5, 24);
    expect(points).toHaveLength(10);
    expect(points[0]).toEqual({ frame: 0, timeSec: 0, translation: [0, 0, 0], rotationDeg: [0, 0, 0], fov: 50 });
    // frame 12 of 120: t = 0.1, dolly * t * 4 = 0.4
    expect(points[1]?.translation).toEqual([0, 0, 0.4]);
    expect(points[1]?.timeSec).toBe(0.5);
  });

  it("narrows the field of view when zooming in", () => {
    const points = cameraWaypoints({ ...STILL_CAMERA, zoom: 2 }, 2, 24);
    const last = points[points.length - 1];
    expect(last?.fov).toBeLessThan(50);
  });

  it("rejects non-positive durations", () => {
    expect(() => cameraWaypoints(STILL_CAMERA, 0)).toThrow();
    expect(() => cameraWaypoints(STILL_CAMERA, 5, 0)).toThrow();
  });
});

describe("characters", () => {
  const mira = defineCharacter({ name: "Mira Voss", description: "short copper hair, green raincoat" });

  it("derives id and trigger from the name", () => {
    expect(mira.id).toBe("char_mira_voss");
    expect(mira.trigger).toBe("[char:mira_voss]");
    expect(mira.loraWeight).toBe(0.85);
  });

  it("rejects blank fields and out-of-range weights", () => {
    expect(() => defineCharacter({ name: " ", description: "x" })).toThrow();
    expect(() => defineCharacter({ name: "A", description: "x", loraWeight: 2 })).toThrow();
    expect(() => defineCharacter({ name: "!!!", description: "x" })).toThrow();
  });

  it("puts the trigger in front of the scene and merges negatives without repeats", () => {
    const out = conditionPrompt("walks along a pier", "blurry, low resolution, warped features", [mira]);
    expect(out.prompt).toBe("[char:mira_voss] (short copper hair, green raincoat), walks along a pier");
    expect(out.negativePrompt).toBe("blurry, low resolution, warped features");
  });

  it("leaves the prompt alone with no characters and rejects an empty prompt", () => {
    expect(conditionPrompt(" a quiet street ", "", []).prompt).toBe("a quiet street");
    expect(() => conditionPrompt("  ", "", [])).toThrow();
  });
});

describe("buildShot", () => {
  it("fills in sizes, frames and a camera path", () => {
    const shot = buildShot({ prompt: "a lighthouse at dusk", aspect: "9:16", durationSec: 4, seed: 7 });
    expect([shot.width, shot.height]).toEqual([1080, 1920]);
    expect(shot.totalFrames).toBe(96);
    expect(shot.camera).toHaveLength(8);
    expect(shot.seed).toBe(7);
    expect(shot.model).toBeNull();
  });

  it("is deterministic for the same input", () => {
    const a = buildShot({ prompt: "x", seed: 3, camera: { pan: 1 } });
    const b = buildShot({ prompt: "x", seed: 3, camera: { pan: 1 } });
    expect(a).toEqual(b);
  });

  it("records which characters were used", () => {
    const c = defineCharacter({ name: "Jun", description: "tall, grey coat" });
    expect(buildShot({ prompt: "x", characters: [c] }).characterIds).toEqual([c.id]);
  });

  it("rejects bad durations and seeds", () => {
    expect(() => buildShot({ prompt: "x", durationSec: 0 })).toThrow();
    expect(() => buildShot({ prompt: "x", durationSec: 31 })).toThrow();
    expect(() => buildShot({ prompt: "x", seed: -1 })).toThrow();
    expect(() => buildShot({ prompt: "x", seed: 1.5 })).toThrow();
  });
});

describe("advance", () => {
  const job: ShotJob = { id: "j1", spec: buildShot({ prompt: "x" }), status: "queued" };

  it("walks queued, running, done and carries the output", () => {
    const done = advance(advance(job, "running"), "done", { output: "drive:Processed/j1.mp4" });
    expect(done.status).toBe("done");
    expect(done.output).toBe("drive:Processed/j1.mp4");
  });

  it("never reports done without an output or failed without an error", () => {
    const running = advance(job, "running");
    expect(() => advance(running, "done")).toThrow();
    expect(() => advance(running, "failed")).toThrow();
  });

  it("does not skip states or leave done", () => {
    expect(() => advance(job, "done", { output: "x" })).toThrow();
    const done = advance(advance(job, "running"), "done", { output: "x" });
    expect(() => advance(done, "queued")).toThrow();
  });

  it("lets a failed job be retried and clears the old error", () => {
    const failed = advance(advance(job, "running"), "failed", { error: "worker timed out" });
    const retry = advance(failed, "queued");
    expect(retry.status).toBe("queued");
    expect(retry.error).toBeUndefined();
  });
});
