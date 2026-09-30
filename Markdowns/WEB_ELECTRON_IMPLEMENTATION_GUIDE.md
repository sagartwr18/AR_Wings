# Technology Stack 1: Web & Electron (Three.js + MediaPipe Web)
## Complete Step-by-Step Implementation Guide

This document provides a complete, production-ready, step-by-step implementation guide for building the **AR Angel Wings Kiosk** using modern Web standards (**Three.js**, **Google MediaPipe Web**, and **Electron**).

---

## Table of Contents
1. [Architecture & Folder Structure](#1-architecture--folder-structure)
2. [Prerequisites & Development Environment](#2-prerequisites--development-environment)
3. [Step 1: Project Setup & Package Configuration](#3-step-1-project-setup--package-configuration)
4. [Step 2: HTML & CSS Layering for Vertical (9:16) Display](#4-step-2-html--css-layering-for-vertical-916-display)
5. [Step 3: High-Performance Camera Stream & Mirroring](#5-step-3-high-performance-camera-stream--mirroring)
6. [Step 4: MediaPipe Pose & Segmentation Setup](#6-step-4-mediapipe-pose--segmentation-setup)
7. [Step 5: The 1€ (One-Euro) Smoothing Filter](#7-step-5-the-1-one-euro-smoothing-filter)
8. [Step 6: Three.js Scene, Camera, & Studio Lighting](#8-step-6-threejs-scene-camera--studio-lighting)
9. [Step 7: Loading & Configuring `hiswings.glb`](#9-step-7-loading--configuring-hiswingsglb)
10. [Step 8: Mathematical 3D Transform Solver (Anchor, Rotation, Scale)](#10-step-8-mathematical-3d-transform-solver-anchor-rotation-scale)
11. [Step 9: Real-Time Occlusion & 3-Layer Compositing](#11-step-9-real-time-occlusion--3-layer-compositing)
12. [Step 10: Procedural Wing Flapping & Arm Gestures](#12-step-10-procedural-wing-flapping--arm-gestures)
13. [Step 11: Particle VFX (Ethereal Glow & Falling Feathers)](#13-step-11-particle-vfx-ethereal-glow--falling-feathers)
14. [Step 12: Packaging as a Desktop Kiosk App with Electron](#14-step-12-packaging-as-a-desktop-kiosk-app-with-electron)
15. [Performance Benchmarks & Optimization Checklist](#15-performance-benchmarks--optimization-checklist)

---

## 1. Architecture & Folder Structure

```
AR Wings Project/
├── angel-wings/
│   ├── source/
│   │   └── hiswings.glb             # 3D Wing Model
│   └── textures/                    # Textures (embedded in GLB, backup here)
├── src/
│   ├── index.html                   # Vertical viewport & layered canvas layout
│   ├── style.css                    # Kiosk fullscreen & layout styles
│   ├── js/
│   │   ├── app.js                   # Application coordinator & main loop
│   │   ├── cameraManager.js         # Camera feed grabber & resolution handler
│   │   ├── poseTracker.js           # MediaPipe Pose & Segmentation pipeline
│   │   ├── oneEuroFilter.js         # 1€ Jitter elimination algorithm
│   │   ├── threeScene.js            # Three.js scene, camera, lights & renderer
│   │   ├── wingsController.js       # 3D model loader, anchor solver, animation
│   │   ├── compositor.js            # 3-layer occlusion compositing engine
│   │   └── particleSystem.js        # Falling feather & sparkle particles
├── electron/
│   └── main.js                      # Electron main process (Kiosk fullscreen)
├── package.json                     # NPM dependencies and scripts
└── vite.config.js                   # Fast development bundler configuration
```

---

## 2. Prerequisites & Development Environment

* **Node.js:** v18.0.0 or later (LTS recommended)
* **Webcam:** 1080p (or 720p minimum) webcam positioned at eye/chest level.
* **Vertical Display:** Monitor rotated physically into **Portrait Mode (9:16 orientation: 1080x1920)**.

---

## 3. Step 1: Project Setup & Package Configuration

Initialize the project with `Vite` for near-instant hot-reloading during development, and `Electron` for the final desktop kiosk bundle.

### `package.json`
```json
{
  "name": "ar-wings-kiosk",
  "version": "1.0.0",
  "private": true,
  "main": "electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "electron:dev": "concurrently \"vite\" \"electron .\"",
    "electron:build": "vite build && electron-builder"
  },
  "dependencies": {
    "@mediapipe/camera_utils": "^0.4.1675466862",
    "@mediapipe/pose": "^0.5.1675469404",
    "three": "^0.160.0"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "electron": "^28.1.0",
    "electron-builder": "^24.9.1",
    "vite": "^5.0.10"
  }
}
```

Install the dependencies:
```bash
npm install
```

---

## 4. Step 2: HTML & CSS Layering for Vertical (9:16) Display

The interface requires strict layering so that the wings appear between the background video and the guest's foreground cutout.

### `src/index.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>AR Angel Wings Experience</title>
  <link rel="stylesheet" href="./style.css" />
</head>
<body>
  <div id="kiosk-container">
    <!-- Hidden input video stream -->
    <video id="webcam-video" playsinline muted autoplay></video>

    <!-- Layer 1 (Bottom): Mirrored camera background -->
    <canvas id="bg-canvas"></canvas>

    <!-- Layer 2 (Middle): Three.js 3D WebGL Canvas for Angel Wings -->
    <canvas id="three-canvas"></canvas>

    <!-- Layer 3 (Top): Real-time person foreground cutout -->
    <canvas id="fg-canvas"></canvas>

    <!-- UI Overlay (Loading / Status) -->
    <div id="ui-overlay">
      <div id="status-badge">Step in front of the mirror</div>
    </div>
  </div>

  <script type="module" src="./js/app.js"></script>
</body>
</html>
```

### `src/style.css`
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  user-select: none;
  overflow: hidden;
}

body, html {
  width: 100vw;
  height: 100vh;
  background-color: #000;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Enforce 9:16 Portrait Ratio on Screen */
#kiosk-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  max-width: 56.25vh; /* 9 / 16 = 0.5625 */
  background: #050505;
}

#webcam-video {
  display: none; /* Processed in memory */
}

/* Layered Canvases stacked in exact order */
#bg-canvas, #three-canvas, #fg-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

#bg-canvas { z-index: 1; }
#three-canvas { z-index: 2; }
#fg-canvas { z-index: 3; }

#ui-overlay {
  position: absolute;
  bottom: 40px;
  width: 100%;
  display: flex;
  justify-content: center;
  z-index: 10;
}

#status-badge {
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 10px 24px;
  border-radius: 20px;
  font-family: sans-serif;
  font-size: 1.1rem;
  letter-spacing: 1px;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

---

## 5. Step 3: High-Performance Camera Stream & Mirroring

### `src/js/cameraManager.js`
Captures portrait or standard high-resolution camera feeds and streams them to the hidden video element.

```javascript
export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement;
  }

  async initialize() {
    const constraints = {
      audio: false,
      video: {
        width: { ideal: 1080 },
        height: { ideal: 1920 },
        facingMode: 'user',
        frameRate: { ideal: 60, min: 30 }
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = stream;
      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve(this.video);
        };
      });
    } catch (err) {
      console.error('Camera access failed:', err);
      // Fallback to standard 1080p landscape if 9:16 resolution is rejected by driver
      const fallbackConstraints = { audio: false, video: { width: 1920, height: 1080 } };
      const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      this.video.srcObject = fallbackStream;
      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve(this.video);
        };
      });
    }
  }
}
```

---

## 6. Step 4: MediaPipe Pose & Segmentation Setup

### `src/js/poseTracker.js`
Configures MediaPipe Pose with **real-time segmentation enabled** so that both skeletal landmarks and the person alpha mask are returned in every frame.

```javascript
export class PoseTracker {
  constructor(onResultsCallback) {
    this.onResultsCallback = onResultsCallback;
    this.pose = new window.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 1,         // 0: Lite (fastest), 1: Full (best balance), 2: Heavy
      smoothLandmarks: true,       // Built-in low-pass filtering
      enableSegmentation: true,    // CRUCIAL: Generates real-time alpha mask
      smoothSegmentation: true,    // Smooths mask boundary jitter
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    this.pose.onResults(this.onResultsCallback);
  }

  async sendFrame(videoElement) {
    await this.pose.send({ image: videoElement });
  }
}
```

---

## 7. Step 5: The 1€ (One-Euro) Smoothing Filter

### `src/js/oneEuroFilter.js`
Neural network landmarks experience high-frequency micro-jitter. The **One-Euro Filter** eliminates jitter when stationary while maintaining zero latency during quick movements.

```javascript
class LowPassFilter {
  constructor(alpha = 0.5) {
    this.alpha = alpha;
    this.s = null;
  }

  filter(value, alpha = this.alpha) {
    if (this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1.0 - alpha) * this.s;
    }
    return this.s;
  }
}

export class OneEuroFilter {
  constructor(freq = 60, mincutoff = 1.0, beta = 0.007, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(val, timestamp) {
    if (this.lastTime !== null && timestamp) {
      this.freq = 1.0 / ((timestamp - this.lastTime) / 1000.0);
    }
    this.lastTime = timestamp;

    const prevX = this.xFilter.s;
    const dx = prevX === null ? 0 : (val - prevX) * this.freq;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dcutoff));
    const cutoff = this.mincutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(val, this.alpha(cutoff));
  }
}
```

---

## 8. Step 6: Three.js Scene, Camera, & Studio Lighting

### `src/js/threeScene.js`
Prepares the transparent WebGL renderer, perspective camera, and 3-point lighting configured to showcase the feather textures.

```javascript
import * as THREE from 'three';

export class ThreeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();

    // Transparent WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Perspective Camera matching vertical aspect ratio
    this.camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 2.5); // 2.5 meters in front of origin

    this.setupLighting();
  }

  setupLighting() {
    // Ambient fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // Key front light
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.0);
    keyLight.position.set(1, 2, 3);
    this.scene.add(keyLight);

    // Rim/Back light (Creates glowing outline on white feathers)
    const rimLight = new THREE.DirectionalLight(0xaad4ff, 3.0);
    rimLight.position.set(0, 3, -2);
    this.scene.add(rimLight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
```

---

## 9. Step 7: Loading & Configuring `hiswings.glb`

### `src/js/wingsController.js` (Part 1: Loader & Optimization)
Loads the model from `angel-wings/source/hiswings.glb` and configures double-sided PBR rendering and feather transparency.

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class WingsController {
  constructor(scene) {
    this.scene = scene;
    this.wingsRoot = new THREE.Group();
    this.scene.add(this.wingsRoot);
    this.wingsModel = null;
    this.isLoaded = false;
    this.flapPhase = 0;
  }

  loadModel(modelUrl = './angel-wings/source/hiswings.glb') {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          this.wingsModel = gltf.scene;

          // Configure materials for feather transparency and double-sided lighting
          this.wingsModel.traverse((child) => {
            if (child.isMesh && child.material) {
              child.material.side = THREE.DoubleSide;
              child.material.transparent = true;
              child.material.depthWrite = true;
              child.material.alphaTest = 0.05;
              child.castShadow = true;
            }
          });

          // Compute initial bounding box and center pivot at thoracic spine base
          const box = new THREE.Box3().setFromObject(this.wingsModel);
          const center = box.getCenter(new THREE.Vector3());
          this.wingsModel.position.x = -center.x;
          this.wingsModel.position.y = -center.y + 0.15; // Shift pivot down to scapula
          this.wingsModel.position.z = -center.z - 0.08; // Push slightly behind back

          this.wingsRoot.add(this.wingsModel);
          this.wingsRoot.visible = false; // Hidden until guest is detected
          this.isLoaded = true;
          resolve(this.wingsRoot);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }
```

---

## 10. Step 8: Mathematical 3D Transform Solver (Anchor, Rotation, Scale)

### `src/js/wingsController.js` (Part 2: Real-Time Solver)
Maps MediaPipe 3D coordinates into Three.js 3D world space.

```javascript
  updateTransform(landmarks, smoothFilters, timestamp) {
    if (!this.isLoaded || !landmarks) {
      this.wingsRoot.visible = false;
      return;
    }

    // Keypoints: Left Shoulder (11), Right Shoulder (12), Left Hip (23), Right Hip (24)
    const rawLS = landmarks[11];
    const rawRS = landmarks[12];
    const rawLH = landmarks[23];
    const rawRH = landmarks[24];

    // Verify detection visibility confidence
    if (rawLS.visibility < 0.6 || rawRS.visibility < 0.6) {
      this.wingsRoot.visible = false;
      return;
    }
    this.wingsRoot.visible = true;

    // 1. Pass through 1€ Filters (Jitter Elimination)
    const ls = {
      x: smoothFilters.lsX.filter(rawLS.x, timestamp),
      y: smoothFilters.lsY.filter(rawLS.y, timestamp),
      z: smoothFilters.lsZ.filter(rawLS.z, timestamp)
    };
    const rs = {
      x: smoothFilters.rsX.filter(rawRS.x, timestamp),
      y: smoothFilters.rsY.filter(rawRS.y, timestamp),
      z: smoothFilters.rsZ.filter(rawRS.z, timestamp)
    };

    // 2. Compute 3D Metric Anchor Point (Spine between shoulder blades)
    // Note: Video is mirrored, so X is inverted. Y points down in image, up in 3D.
    const shoulderMidX = (ls.x + rs.x) / 2.0;
    const shoulderMidY = (ls.y + rs.y) / 2.0;
    const shoulderDepth = (ls.z + rs.z) / 2.0;

    // Convert normalized [0,1] coordinates into Three.js Camera View coordinates
    const targetX = (shoulderMidX - 0.5) * -2.4; // Mirrored
    const targetY = -(shoulderMidY - 0.5) * 3.2 - 0.15; // Offset down along spine
    const targetZ = -shoulderDepth * 1.5 - 0.2; // Push behind guest back

    this.wingsRoot.position.set(targetX, targetY, targetZ);

    // 3. Compute 3D Rotation Matrix (Pitch, Yaw, Roll)
    // Vector X (Shoulder-to-Shoulder)
    const vX = new THREE.Vector3(rs.x - ls.x, -(rs.y - ls.y), rs.z - ls.z).normalize();
    // Approximate Spine Vector Y
    const vY = new THREE.Vector3(0, 1, 0);
    // Torso Normal Vector Z (Cross product)
    const vZ = new THREE.Vector3().crossVectors(vX, vY).normalize();
    vX.crossVectors(vY, vZ).normalize(); // Re-orthogonalize

    const rotMatrix = new THREE.Matrix4().makeBasis(vX, vY, vZ.negate());
    this.wingsRoot.quaternion.setFromRotationMatrix(rotMatrix);

    // 4. Adaptive Scaling (Adult vs. Child & Distance)
    const shoulderSpan = Math.hypot(rs.x - ls.x, rs.y - ls.y);
    const baseScale = 0.55; // Calibrated for hiswings.glb (4m wingspan)
    const currentScale = shoulderSpan * baseScale;
    this.wingsRoot.scale.set(currentScale, currentScale, currentScale);
  }
}
```

---

## 11. Step 9: Real-Time Occlusion & 3-Layer Compositing

### `src/js/compositor.js`
This is the heart of the illusion. It composites the 3 layers in real time:
1. **Background Layer:** Mirrored webcam frame.
2. **Middle Layer:** Three.js transparent WebGL render of the 3D wings.
3. **Foreground Layer:** Person silhouette extracted using the MediaPipe segmentation mask.

```javascript
export class Compositor {
  constructor(bgCanvas, fgCanvas, videoElement) {
    this.bgCanvas = bgCanvas;
    this.fgCanvas = fgCanvas;
    this.video = videoElement;

    this.bgCtx = bgCanvas.getContext('2d');
    this.fgCtx = fgCanvas.getContext('2d');
  }

  resize(width, height) {
    this.bgCanvas.width = width;
    this.bgCanvas.height = height;
    this.fgCanvas.width = width;
    this.fgCanvas.height = height;
  }

  render(segmentationMask) {
    const w = this.bgCanvas.width;
    const h = this.bgCanvas.height;

    // -------------------------------------------------------------
    // LAYER 1: Background Mirrored Video
    // -------------------------------------------------------------
    this.bgCtx.save();
    this.bgCtx.clearRect(0, 0, w, h);
    this.bgCtx.translate(w, 0);
    this.bgCtx.scale(-1, 1); // Mirror horizontally
    this.bgCtx.drawImage(this.video, 0, 0, w, h);
    this.bgCtx.restore();

    // -------------------------------------------------------------
    // LAYER 3: Foreground Person Cutout (Occludes the wings)
    // -------------------------------------------------------------
    if (segmentationMask) {
      this.fgCtx.save();
      this.fgCtx.clearRect(0, 0, w, h);

      // 1. Draw mirrored segmentation mask
      this.fgCtx.translate(w, 0);
      this.fgCtx.scale(-1, 1);
      this.fgCtx.drawImage(segmentationMask, 0, 0, w, h);

      // 2. Keep only the person using 'source-in'
      this.fgCtx.globalCompositeOperation = 'source-in';
      this.fgCtx.drawImage(this.video, 0, 0, w, h);

      this.fgCtx.restore();
    }
  }
}
```

---

## 12. Step 10: Procedural Wing Flapping & Arm Gestures

### `src/js/wingsController.js` (Part 3: Animation Loop)
Incorporate idle breathing and gesture-reactive flapping without needing pre-baked animations.

```javascript
  animateWings(delta, wristVelocity = 0) {
    if (!this.wingsModel) return;

    // Idle breathing frequency: ~0.8 Hz
    const idleFreq = 2.5;
    const idleAmplitude = 0.08; // ~4.5 degrees gentle flutter

    // Gesture amplification: flap faster/wider when arms move
    const gestureAmplitude = Math.min(wristVelocity * 0.4, 0.35);
    const totalAmplitude = idleAmplitude + gestureAmplitude;

    this.flapPhase += delta * (idleFreq + wristVelocity * 4.0);
    const flapAngle = Math.sin(this.flapPhase) * totalAmplitude;

    // Apply procedural flutter on the Z/Y rotation axis
    this.wingsModel.rotation.y = flapAngle;
  }
```

---

## 13. Step 11: Particle VFX (Ethereal Glow & Falling Feathers)

### `src/js/particleSystem.js`
A lightweight GPU particle system rendering floating golden sparkles and drifting feathers.

```javascript
import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, count = 120) {
    this.scene = scene;
    this.count = count;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 2.5; // X
      positions[i * 3 + 1] = Math.random() * 2.0;         // Y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.5; // Z

      velocities[i * 3 + 1] = -(0.2 + Math.random() * 0.3); // Drift downward
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.velocities = velocities;

    const material = new THREE.PointsMaterial({
      color: 0xffe6a3,
      size: 0.035,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  update(delta) {
    const pos = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      pos[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;

      // Respawn at top if fallen below threshold
      if (pos[i * 3 + 1] < -1.5) {
        pos[i * 3 + 1] = 1.5;
        pos[i * 3 + 0] = (Math.random() - 0.5) * 2.0;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }
}
```

---

## 14. Step 12: Packaging as a Desktop Kiosk App with Electron

### `electron/main.js`
Launches the application as a frameless, fullscreen, tamper-proof kiosk application on Windows.

```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: true,
    kiosk: true,              // Locks the system into kiosk mode
    frame: false,             // Frameless window
    alwaysOnTop: true,        // Prevents other apps from taking focus
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // Keeps running at 60 FPS even if unfocused
    }
  });

  // Enable hardware camera access permissions automatically
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

---

## 15. Performance Benchmarks & Optimization Checklist

### Target Performance Metrics
* **Resolution:** 1080 × 1920 (Vertical Portrait)
* **Frame Rate:** 60 FPS rendering, 30–60 FPS MediaPipe AI inference.
* **Tracking Latency:** 20–35 ms (perceptually instantaneous).

### Optimization Best Practices
1. **WebGL Canvas Size:** Always set `renderer.setSize(w, h, false)` without altering CSS layout styles.
2. **Garbage Collection Optimization:** Pre-allocate `THREE.Vector3`, `THREE.Quaternion`, and `THREE.Matrix4` instances outside the tracking callback loop to avoid memory churn and GC frame-drops.
3. **GPU Hardware Acceleration:** Ensure Chrome/Electron has GPU acceleration enabled:
   ```bash
   --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist
   ```
4. **Resolution Scaling:** If running on a mini-PC (e.g., Intel N100 / AMD Ryzen APU), downsample the MediaPipe input processing frame to $720 \times 1280$ while keeping the WebGL canvas at full native $1080 \times 1920$ display resolution.
