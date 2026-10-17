/**
 * Camera trajectory for video models that accept camera conditioning.
 * Ported from the author's own `wiza` repo (MIT): the same waypoint formulas, as pure functions.
 */
export interface CameraMotion {
  pan: number;
  tilt: number;
  zoom: number;
  dolly: number;
  crane: number;
  roll: number;
}

export interface CameraWaypoint {
  frame: number;
  timeSec: number;
  translation: [number, number, number];
  rotationDeg: [number, number, number];
  fov: number;
}

export const STILL_CAMERA: CameraMotion = { pan: 0, tilt: 0, zoom: 0, dolly: 0, crane: 0, roll: 0 };

const round = (value: number, digits: number): number => Number(value.toFixed(digits));

/** One waypoint every `stepFrames` frames (default 12, half a second at 24 fps). Motion grows linearly with time. */
export function cameraWaypoints(
  motion: CameraMotion,
  durationSec: number,
  fps = 24,
  stepFrames = 12,
): CameraWaypoint[] {
  if (!(durationSec > 0) || !(fps > 0) || !(stepFrames >= 1)) throw new Error("duration, fps and stepFrames must be positive");
  const totalFrames = Math.round(durationSec * fps);
  const out: CameraWaypoint[] = [];
  for (let frame = 0; frame < totalFrames; frame += stepFrames) {
    const t = frame / totalFrames;
    out.push({
      frame,
      timeSec: round(t * durationSec, 2),
      translation: [round(motion.pan * t * 2, 3), round(motion.crane * t * 2, 3), round(motion.dolly * t * 4, 3)],
      rotationDeg: [round(motion.tilt * t * 15, 2), round(motion.pan * t * 20, 2), round(motion.roll * t * 10, 2)],
      fov: round(50 / Math.max(0.1, 1 + motion.zoom * t * 0.5), 1),
    });
  }
  return out;
}
