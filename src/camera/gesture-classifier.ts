// Pure functions over MediaPipe's 21-point hand landmark model. No camera or
// DOM access here, so this is unit-testable with plain synthetic landmarks.
// https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
export interface Landmark {
  x: number;
  y: number;
}

export type HandShape = "open" | "fist" | "unknown";

const WRIST = 0;
// [mcp, tip] pairs for the four fingers whose curl is a reliable open/close
// signal — the thumb moves too laterally for the same radial-distance test.
const FINGERS: [mcp: number, tip: number][] = [
  [5, 8], // index
  [9, 12], // middle
  [13, 16], // ring
  [17, 20], // pinky
];

const EXTENSION_RATIO = 1.15;
const OPEN_THRESHOLD = 3; // >= this many fingers extended -> "open"
const FIST_THRESHOLD = 1; // <= this many fingers extended -> "fist"

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Counts fingers whose tip sits meaningfully farther from the wrist than their MCP joint. */
function countExtendedFingers(landmarks: readonly Landmark[]): number {
  const wrist = landmarks[WRIST];
  let extended = 0;
  for (const [mcp, tip] of FINGERS) {
    if (distance(wrist, landmarks[tip]) > distance(wrist, landmarks[mcp]) * EXTENSION_RATIO) {
      extended += 1;
    }
  }
  return extended;
}

/** Classifies a single hand's 21 landmarks as an open palm, a fist, or neither. */
export function classifyHandShape(landmarks: readonly Landmark[]): HandShape {
  const extended = countExtendedFingers(landmarks);
  if (extended >= OPEN_THRESHOLD) return "open";
  if (extended <= FIST_THRESHOLD) return "fist";
  return "unknown";
}

/** The hand's anchor point: the average of the wrist and the four MCP joints. */
export function palmCenter(landmarks: readonly Landmark[]): Landmark {
  const indices = [WRIST, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  for (const index of indices) {
    x += landmarks[index].x;
    y += landmarks[index].y;
  }
  return { x: x / indices.length, y: y / indices.length };
}

export type MediaPipeHandedness = "Left" | "Right";
export type PhysicalHand = "left" | "right";

/**
 * MediaPipe's handedness label assumes a mirrored (selfie-style) input image.
 * getUserMedia delivers the raw, unmirrored sensor frame — we only mirror it
 * with CSS for on-screen display — so the label must be swapped to recover
 * which hand the player is physically holding up.
 */
export function physicalHandedness(label: MediaPipeHandedness): PhysicalHand {
  return label === "Left" ? "right" : "left";
}
