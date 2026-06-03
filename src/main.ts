import "./styles.css";
import * as THREE from "three";
import { EffectsRenderer, type WritingAnchors } from "./effects";
import { PinchGestureRecognizer, type GestureState } from "./gesture";
import { HandTracker, type Landmark } from "./handTracking";

const STATUS_LABELS: Record<GestureState, string> = {
  writing: "书写",
  idle: "空闲",
};

const video = getElement<HTMLVideoElement>("camera");
const canvas = getElement<HTMLCanvasElement>("effects");
const statusLabel = getElement<HTMLDivElement>("status");
const effects = new EffectsRenderer(canvas);
const gesture = new PinchGestureRecognizer();

let lastFrameTime = performance.now();

void start();

async function start(): Promise<void> {
  try {
    setStatus("请求摄像头");
    await startCamera(video);

    setStatus("加载模型");
    const tracker = new HandTracker();
    await tracker.init();

    setStatus("空闲");
    requestAnimationFrame((time) => tick(time, tracker));
  } catch (error) {
    console.error(error);
    setStatus(`错误：${formatError(error)}`, true);
  }
}

async function startCamera(targetVideo: HTMLVideoElement): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持摄像头访问");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
    },
  });

  targetVideo.srcObject = stream;
  await new Promise<void>((resolve, reject) => {
    targetVideo.onloadedmetadata = () => resolve();
    targetVideo.onerror = () => reject(new Error("摄像头视频加载失败"));
  });
  await targetVideo.play();
}

function tick(time: number, tracker: HandTracker): void {
  const delta = Math.min(0.05, Math.max(0.001, (time - lastFrameTime) / 1000));
  lastFrameTime = time;

  let mode: GestureState = "idle";
  let anchors: WritingAnchors = {};

  try {
    const landmarks = tracker.detect(video);
    if (landmarks) {
      const analysis = gesture.analyze(landmarks);
      anchors = createAnchors(landmarks);
      mode = analysis.state;
    } else {
      gesture.reset();
    }

    effects.update(mode === "writing", anchors, time / 1000, delta);
    setStatus(STATUS_LABELS[mode]);
    requestAnimationFrame((nextTime) => tick(nextTime, tracker));
  } catch (error) {
    console.error(error);
    setStatus(`错误：${formatError(error)}`, true);
  }
}

function createAnchors(landmarks: Landmark[]): WritingAnchors {
  const world = (index: number) => effects.landmarkToWorld(landmarks[index], video);
  const thumbTip = world(4);
  const indexTip = world(8);
  const palm = [0, 5, 9, 13, 17]
    .map(world)
    .reduce((sum, point) => sum.add(point), new THREE.Vector3())
    .multiplyScalar(1 / 5);

  return {
    indexTip,
    thumbTip,
    pinchCenter: thumbTip.clone().lerp(indexTip, 0.5),
    palm,
  };
}

function setStatus(text: string, isError = false): void {
  statusLabel.textContent = text;
  statusLabel.classList.toggle("error", isError);
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`缺少页面元素：#${id}`);
  }
  return element as T;
}

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "摄像头权限被拒绝";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "启动失败";
}
