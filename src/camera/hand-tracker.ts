// Thin browser wrapper around MediaPipe Tasks Vision's HandLandmarker: owns
// the camera stream, the detector instance, and the requestAnimationFrame
// loop. Everything here needs a real browser (camera hardware, WASM, video
// decoding), so — per the spec — it is deliberately left untested; the
// gesture logic it feeds is pure and lives (and is tested) in
// gesture-classifier.ts and gesture-state-machine.ts.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

// Pinned to the installed package version so the WASM binary always matches
// the JS bindings bundled with it.
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface TrackedHand {
  handedness: "Left" | "Right";
  confidence: number;
  landmarks: { x: number; y: number }[];
}

export type HandFrameListener = (hands: TrackedHand[]) => void;

/** Acquires the camera and runs live two-hand detection until stop() is called. */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private lastTimestamp = -1;
  private stopped = false;

  /** Resolves with a playing, not-yet-attached `<video>` for the caller to mount. */
  async start(onFrame: HandFrameListener): Promise<HTMLVideoElement> {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    if (this.stopped) {
      landmarker.close();
      throw new DOMException("Camera stopped before it finished starting", "AbortError");
    }
    this.landmarker = landmarker;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    if (this.stopped) {
      for (const track of stream.getTracks()) track.stop();
      throw new DOMException("Camera stopped before it finished starting", "AbortError");
    }
    this.stream = stream;

    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    this.video = video;

    const loop = (): void => {
      if (this.stopped || !this.landmarker || !this.video) return;
      const now = performance.now();
      if (now !== this.lastTimestamp && this.video.readyState >= 2) {
        this.lastTimestamp = now;
        const result = this.landmarker.detectForVideo(this.video, now);
        onFrame(
          result.landmarks.map((landmarks, index) => {
            const category = result.handedness[index]?.[0];
            return {
              handedness: category?.categoryName === "Left" ? "Left" : "Right",
              confidence: category?.score ?? 0,
              landmarks,
            };
          }),
        );
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    return video;
  }

  stop(): void {
    this.stopped = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.video = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.lastTimestamp = -1;
  }
}
