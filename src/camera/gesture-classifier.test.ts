import { describe, expect, it } from "vitest";
import { classifyHandShape, palmCenter, physicalHandedness, registerForHand } from "./gesture-classifier";

// Builds a synthetic 21-point hand at the origin, wrist at (0,0), with each
// of the four fingers (index/middle/ring/pinky) independently either
// "extended" (tip well past its MCP) or "curled" (tip back near its MCP).
const MCP_DIST = [0.3, 0.32, 0.3, 0.26] as const;
const FINGER_JOINTS: [mcp: number, tip: number][] = [
  [5, 8],
  [9, 12],
  [13, 16],
  [17, 20],
];

function landmarks(extended: readonly boolean[]): { x: number; y: number }[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  FINGER_JOINTS.forEach(([mcp, tip], index) => {
    const mcpDist = MCP_DIST[index];
    points[mcp] = { x: mcpDist, y: 0 };
    // 2x the MCP distance reads as clearly extended, 1x (the MCP joint
    // itself) reads as fully curled back.
    points[tip] = { x: mcpDist * (extended[index] ? 2 : 1), y: 0 };
  });
  return points;
}

describe("classifyHandShape", () => {
  it("reads a fully open hand (4 fingers extended) as open", () => {
    expect(classifyHandShape(landmarks([true, true, true, true]))).toBe("open");
  });

  it("reads a fully curled hand (0 fingers extended) as a fist", () => {
    expect(classifyHandShape(landmarks([false, false, false, false]))).toBe("fist");
  });

  it("reads a half-curled hand (2 of 4 extended) as unknown, not open or fist", () => {
    expect(classifyHandShape(landmarks([true, true, false, false]))).toBe("unknown");
  });

  it("still reads a fist with one stray extended finger as a fist", () => {
    expect(classifyHandShape(landmarks([true, false, false, false]))).toBe("fist");
  });

  it("still reads an open hand missing one extended finger as open", () => {
    expect(classifyHandShape(landmarks([true, true, true, false]))).toBe("open");
  });
});

describe("palmCenter", () => {
  it("averages the wrist and the four MCP joints", () => {
    const points = landmarks([true, true, true, true]);
    const center = palmCenter(points);
    const expectedX = MCP_DIST.reduce((sum, d) => sum + d, 0) / 5;
    expect(center.x).toBeCloseTo(expectedX, 10);
    expect(center.y).toBeCloseTo(0, 10);
  });
});

describe("physicalHandedness", () => {
  it("trusts MediaPipe's label as the physical hand", () => {
    // Verified against a real camera: the mirrored-input swap theory read
    // backwards in practice, so the raw label is used directly.
    expect(physicalHandedness("Left")).toBe("left");
    expect(physicalHandedness("Right")).toBe("right");
  });
});

describe("registerForHand", () => {
  it("splits low/high between hands when both are visible", () => {
    expect(registerForHand("left", true)).toBe("low");
    expect(registerForHand("right", true)).toBe("high");
  });

  it("defaults a lone hand to the high register, whichever hand it is", () => {
    expect(registerForHand("left", false)).toBe("high");
    expect(registerForHand("right", false)).toBe("high");
  });
});
