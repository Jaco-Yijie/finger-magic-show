import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export type Landmark = {
  x: number;
  y: number;
  z: number;
};

const WASM_ROOT = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/hand_landmarker.task";

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private smoothedLandmarks: Landmark[] | null = null;
  private readonly smoothingFactor = 0.36;

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.landmarker = await this.createLandmarker(vision);
  }

  detect(video: HTMLVideoElement): Landmark[] | null {
    if (!this.landmarker || video.readyState < 2) {
      return null;
    }

    const result = this.landmarker.detectForVideo(video, performance.now());
    const landmarks = result.landmarks[0];

    if (!landmarks) {
      this.smoothedLandmarks = null;
      return null;
    }

    const normalized = landmarks.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
    }));

    this.smoothedLandmarks = this.smooth(normalized);
    return this.smoothedLandmarks.map((point) => ({ ...point }));
  }

  private async createLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  ): Promise<HandLandmarker> {
    const options = {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };

    try {
      return await HandLandmarker.createFromOptions(vision, options);
    } catch (gpuError) {
      console.warn("GPU Hand Landmarker 初始化失败，尝试 CPU。", gpuError);
      return HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: "CPU" as const,
        },
      });
    }
  }

  private smooth(next: Landmark[]): Landmark[] {
    if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== next.length) {
      return next;
    }

    return next.map((point, index) => {
      const previous = this.smoothedLandmarks?.[index] ?? point;
      return {
        x: previous.x + (point.x - previous.x) * this.smoothingFactor,
        y: previous.y + (point.y - previous.y) * this.smoothingFactor,
        z: previous.z + (point.z - previous.z) * this.smoothingFactor,
      };
    });
  }
}
