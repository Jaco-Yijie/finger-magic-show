import type { Landmark } from "./handTracking";

export type GestureState = "writing" | "idle";

export type GestureAnalysis = {
  state: GestureState;
  isPinching: boolean;
  pinchRatio: number;
};

const PINCH_START_RATIO = 0.42;
const PINCH_RELEASE_RATIO = 0.58;

export class PinchGestureRecognizer {
  private isPinching = false;

  analyze(landmarks: Landmark[]): GestureAnalysis {
    if (landmarks.length < 21) {
      this.reset();
      return {
        state: "idle",
        isPinching: false,
        pinchRatio: Number.POSITIVE_INFINITY,
      };
    }

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const palmScale = Math.max(distance2d(landmarks[0], landmarks[9]), distance2d(landmarks[5], landmarks[17]), 0.001);
    const pinchRatio = distance2d(thumbTip, indexTip) / palmScale;
    const threshold = this.isPinching ? PINCH_RELEASE_RATIO : PINCH_START_RATIO;

    this.isPinching = pinchRatio < threshold;

    return {
      state: this.isPinching ? "writing" : "idle",
      isPinching: this.isPinching,
      pinchRatio,
    };
  }

  reset(): void {
    this.isPinching = false;
  }
}

function distance2d(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
