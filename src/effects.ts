import * as THREE from "three";
import type { Landmark } from "./handTracking";

export type WritingAnchors = {
  indexTip?: THREE.Vector3;
  thumbTip?: THREE.Vector3;
  pinchCenter?: THREE.Vector3;
  palm?: THREE.Vector3;
};

export class EffectsRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly writing: AirWritingEffect;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(-240, 280, 420);
    this.scene.add(keyLight);

    this.writing = new AirWritingEffect(this.scene);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  landmarkToWorld(point: Landmark, video: HTMLVideoElement): THREE.Vector3 {
    const videoWidth = video.videoWidth || this.width;
    const videoHeight = video.videoHeight || this.height;
    const videoAspect = videoWidth / videoHeight;
    const viewportAspect = this.width / this.height;
    let renderedWidth = this.width;
    let renderedHeight = this.height;
    let offsetX = 0;
    let offsetY = 0;

    if (viewportAspect > videoAspect) {
      renderedHeight = this.width / videoAspect;
      offsetY = (this.height - renderedHeight) / 2;
    } else {
      renderedWidth = this.height * videoAspect;
      offsetX = (this.width - renderedWidth) / 2;
    }

    const mirroredX = 1 - clamp(point.x, 0, 1);
    const pixelX = offsetX + mirroredX * renderedWidth;
    const pixelY = offsetY + clamp(point.y, 0, 1) * renderedHeight;
    const z = clamp(-(point.z ?? 0) * 420, -130, 130);

    return new THREE.Vector3(pixelX - this.width / 2, this.height / 2 - pixelY, z);
  }

  update(isWriting: boolean, anchors: WritingAnchors, time: number, delta: number): void {
    const penTarget = anchors.pinchCenter ?? anchors.indexTip;
    this.writing.update(isWriting, penTarget, time, delta);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.left = -this.width / 2;
    this.camera.right = this.width / 2;
    this.camera.top = this.height / 2;
    this.camera.bottom = -this.height / 2;
    this.camera.position.set(0, 0, 500);
    this.camera.updateProjectionMatrix();
  }
}

class AirWritingEffect {
  private readonly scene: THREE.Scene;
  private readonly pen = new THREE.Group();
  private readonly penCore: THREE.Mesh;
  private readonly penAura: THREE.Mesh;
  private readonly penRing: THREE.Mesh;
  private readonly particles: MagicParticles;
  private readonly strokes: MagicStroke[] = [];
  private readonly follow = new THREE.Vector3();
  private activeStroke: MagicStroke | null = null;
  private hadTarget = false;
  private wasWriting = false;
  private emitCarry = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.penCore = new THREE.Mesh(
      new THREE.SphereGeometry(8, 24, 16),
      new THREE.MeshBasicMaterial({
        color: "#f8fbff",
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.penAura = new THREE.Mesh(
      new THREE.SphereGeometry(24, 32, 16),
      new THREE.MeshBasicMaterial({
        color: "#6bdcff",
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.penRing = new THREE.Mesh(
      new THREE.TorusGeometry(28, 1.8, 8, 64),
      new THREE.MeshBasicMaterial({
        color: "#c58cff",
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.penRing.rotation.x = Math.PI / 2.6;
    this.pen.add(this.penAura, this.penCore, this.penRing);
    this.pen.visible = false;
    scene.add(this.pen);

    this.particles = new MagicParticles(scene);
  }

  update(isWriting: boolean, target: THREE.Vector3 | undefined, time: number, delta: number): void {
    if (!target) {
      this.pen.visible = false;
      this.finishActiveStroke();
      this.hadTarget = false;
      this.wasWriting = false;
      this.updateStrokes(time, delta);
      this.particles.update(delta);
      return;
    }

    if (!this.hadTarget) {
      this.follow.copy(target);
      this.hadTarget = true;
    } else {
      this.follow.lerp(target, smoothingForDelta(delta, isWriting ? 30 : 18));
    }

    this.updatePen(isWriting, time);

    if (isWriting && !this.wasWriting) {
      this.startStroke(this.follow);
      this.particles.burst(this.follow, 24, 175);
    }

    if (!isWriting && this.wasWriting) {
      this.finishActiveStroke();
      this.particles.burst(this.follow, 14, 110);
    }

    if (isWriting) {
      this.activeStroke?.append(this.follow);
      this.emitCarry += delta * 72;
      while (this.emitCarry >= 1) {
        this.particles.emit(this.follow, 1, 120);
        this.emitCarry -= 1;
      }
    }

    this.wasWriting = isWriting;
    this.updateStrokes(time, delta);
    this.particles.update(delta);
  }

  private updatePen(isWriting: boolean, time: number): void {
    this.pen.visible = true;
    this.pen.position.copy(this.follow).add(new THREE.Vector3(0, 0, 42));
    this.pen.scale.setScalar(isWriting ? 1.18 : 0.72);
    this.penRing.rotation.z += isWriting ? 0.12 : 0.045;
    this.penRing.scale.setScalar(1 + Math.sin(time * 7.5) * 0.08);

    const coreMaterial = this.penCore.material as THREE.MeshBasicMaterial;
    const auraMaterial = this.penAura.material as THREE.MeshBasicMaterial;
    const ringMaterial = this.penRing.material as THREE.MeshBasicMaterial;
    coreMaterial.opacity = isWriting ? 0.98 : 0.48;
    auraMaterial.opacity = isWriting ? 0.38 + Math.sin(time * 8) * 0.08 : 0.14;
    ringMaterial.opacity = isWriting ? 0.62 : 0.22;
  }

  private startStroke(point: THREE.Vector3): void {
    this.activeStroke = new MagicStroke(this.scene, point);
    this.strokes.push(this.activeStroke);

    if (this.strokes.length > 8) {
      const oldStroke = this.strokes.shift();
      oldStroke?.dispose();
    }
  }

  private finishActiveStroke(): void {
    this.activeStroke?.finish();
    this.activeStroke = null;
  }

  private updateStrokes(time: number, delta: number): void {
    for (let index = this.strokes.length - 1; index >= 0; index -= 1) {
      if (!this.strokes[index].update(time, delta)) {
        this.strokes[index].dispose();
        this.strokes.splice(index, 1);
      }
    }
  }
}

class MagicStroke {
  private readonly group = new THREE.Group();
  private readonly ribbonMaterial = new THREE.MeshBasicMaterial({
    color: "#57d7ff",
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly coreMaterial = new THREE.LineBasicMaterial({
    color: "#fff7c8",
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private readonly sparkMaterial = new THREE.PointsMaterial({
    color: "#c78cff",
    size: 5,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private ribbon = new THREE.Mesh(new THREE.BufferGeometry(), this.ribbonMaterial);
  private core = new THREE.Line(new THREE.BufferGeometry(), this.coreMaterial);
  private sparks = new THREE.Points(new THREE.BufferGeometry(), this.sparkMaterial);
  private points: THREE.Vector3[] = [];
  private finished = false;
  private age = 0;
  private readonly lifeAfterFinish = 4.8;

  constructor(scene: THREE.Scene, firstPoint: THREE.Vector3) {
    this.points = [firstPoint.clone()];
    this.group.add(this.ribbon, this.core, this.sparks);
    scene.add(this.group);
    this.rebuild();
  }

  append(point: THREE.Vector3): void {
    const last = this.points[this.points.length - 1];
    if (last && last.distanceTo(point) < 4) {
      return;
    }

    this.points.push(point.clone());
    if (this.points.length > 320) {
      this.points.shift();
    }
    this.rebuild();
  }

  finish(): void {
    this.finished = true;
  }

  update(time: number, delta: number): boolean {
    if (this.finished) {
      this.age += delta;
      this.group.position.y += delta * 7;
      this.group.rotation.z = Math.sin(time * 0.9 + this.points.length) * 0.012;
    }

    const fade = this.finished ? 1 - clamp(this.age / this.lifeAfterFinish, 0, 1) : 1;
    this.ribbonMaterial.opacity = 0.72 * fade;
    this.coreMaterial.opacity = 0.9 * fade;
    this.sparkMaterial.opacity = 0.78 * fade;
    this.group.scale.setScalar(1 + (this.finished ? this.age * 0.025 : 0));

    return !this.finished || this.age < this.lifeAfterFinish;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.ribbon.geometry.dispose();
    this.core.geometry.dispose();
    this.sparks.geometry.dispose();
    this.ribbonMaterial.dispose();
    this.coreMaterial.dispose();
    this.sparkMaterial.dispose();
  }

  private rebuild(): void {
    this.ribbon.geometry.dispose();
    this.core.geometry.dispose();
    this.sparks.geometry.dispose();
    this.ribbon.geometry = buildRibbonGeometry(this.points);
    this.core.geometry = buildLineGeometry(this.points);
    this.sparks.geometry = buildSparkGeometry(this.points);
  }
}

class MagicParticles {
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: THREE.Vector3[] = [];
  private readonly ages: number[] = [];
  private readonly lifetimes: number[] = [];
  private readonly active: boolean[] = [];

  constructor(scene: THREE.Scene) {
    const count = 220;
    this.positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      this.positions[index * 3] = 9999;
      this.positions[index * 3 + 1] = 9999;
      this.positions[index * 3 + 2] = 9999;
      this.velocities.push(new THREE.Vector3());
      this.ages.push(0);
      this.lifetimes.push(1);
      this.active.push(false);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: "#dff8ff",
        size: 5.5,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(this.points);
  }

  emit(origin: THREE.Vector3, count: number, speed: number): void {
    for (let emitted = 0; emitted < count; emitted += 1) {
      const index = this.active.findIndex((value) => !value);
      if (index < 0) {
        return;
      }

      const angle = Math.random() * Math.PI * 2;
      const radius = randomRange(0.2, 1);
      this.active[index] = true;
      this.ages[index] = 0;
      this.lifetimes[index] = randomRange(0.45, 1.15);
      this.positions[index * 3] = origin.x + randomRange(-6, 6);
      this.positions[index * 3 + 1] = origin.y + randomRange(-6, 6);
      this.positions[index * 3 + 2] = origin.z + 46 + randomRange(-10, 10);
      this.velocities[index].set(
        Math.cos(angle) * speed * radius,
        Math.sin(angle) * speed * radius + randomRange(-30, 70),
        randomRange(-60, 80),
      );
    }
  }

  burst(origin: THREE.Vector3, count: number, speed: number): void {
    this.emit(origin, count, speed);
  }

  update(delta: number): void {
    for (let index = 0; index < this.active.length; index += 1) {
      if (!this.active[index]) {
        continue;
      }

      this.ages[index] += delta;
      if (this.ages[index] >= this.lifetimes[index]) {
        this.active[index] = false;
        this.positions[index * 3] = 9999;
        this.positions[index * 3 + 1] = 9999;
        this.positions[index * 3 + 2] = 9999;
        continue;
      }

      const velocity = this.velocities[index];
      velocity.multiplyScalar(Math.pow(0.965, delta * 60));
      velocity.y -= delta * 42;
      this.positions[index * 3] += velocity.x * delta;
      this.positions[index * 3 + 1] += velocity.y * delta;
      this.positions[index * 3 + 2] += velocity.z * delta;
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

function buildRibbonGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  if (points.length < 2) {
    return geometry;
  }

  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const direction = next.clone().sub(previous);
    const length = Math.hypot(direction.x, direction.y) || 1;
    const normal = new THREE.Vector3(-direction.y / length, direction.x / length, 0);
    const progress = index / Math.max(1, points.length - 1);
    const width = 6 + Math.sin(progress * Math.PI) * 8;
    const left = points[index].clone().addScaledVector(normal, width);
    const right = points[index].clone().addScaledVector(normal, -width);
    left.z += 36;
    right.z += 36;
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);

    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function buildLineGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = points.flatMap((point) => [point.x, point.y, point.z + 48]);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function buildSparkGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  for (let index = 0; index < points.length; index += 5) {
    const point = points[index];
    positions.push(
      point.x + randomRange(-8, 8),
      point.y + randomRange(-8, 8),
      point.z + 52 + randomRange(-8, 8),
    );
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function smoothingForDelta(delta: number, speed: number): number {
  return 1 - Math.exp(-speed * delta);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
