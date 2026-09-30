import gsap from 'gsap';
import QRCode from 'qrcode';
import { CameraManager } from './cameraManager.js';
import { ThreeScene } from './threeScene.js';
import { WingsController } from './wingsController.js';
import { Compositor } from './compositor.js';
import { ParticleSystem } from './particleSystem.js';
import { PoseTracker } from './poseTracker.js';
import { Point3DFilter } from './oneEuroFilter.js';
import { GenderDetector, getApiBaseUrl } from './genderDetector.js';

class ARWingsApp {
  constructor() {
    this.video = document.getElementById('webcam-video');
    this.bgCanvas = document.getElementById('bg-canvas');
    this.threeCanvas = document.getElementById('three-canvas');
    this.fgCanvas = document.getElementById('fg-canvas');

    this.fpsBadge = document.getElementById('fps-badge');
    this.statusPill = document.getElementById('status-pill');
    this.statusText = document.getElementById('status-text');
    this.btnCamera = document.getElementById('btn-camera');
    this.btnFullscreen = document.getElementById('btn-fullscreen');

    // Layers for Bottom-to-Top GSAP Page Transitions
    this.cameraLayer = document.getElementById('camera-layer');
    this.maleInfoLayer = document.getElementById('male-info-layer');
    this.isInfoVisible = false;
    this.isAnimating = false;
    this.pendingReturn = false;

    // Photo Capture & QR Code Modal Elements
    this.captureBar = document.getElementById('capture-bar');
    this.btnCapture = document.getElementById('btn-capture');
    this.cameraFlash = document.getElementById('camera-flash');
    this.qrModal = document.getElementById('qr-modal');
    this.qrBackdrop = document.getElementById('qr-backdrop');
    this.btnCloseQr = document.getElementById('btn-close-qr');
    this.qrCanvas = document.getElementById('qr-canvas');
    this.qrPreviewImg = document.getElementById('qr-preview-img');
    this.qrUrlDisplay = document.getElementById('qr-url-display');
    this.qrTimer = document.getElementById('qr-timer');
    this.qrCountdown = null;
    this.isCapturing = false;

    // 1€ Filter instances for shoulders
    this.filterLS = new Point3DFilter(60, 1.0, 0.007);
    this.filterRS = new Point3DFilter(60, 1.0, 0.007);

    // Timing & performance monitoring
    this.lastTime = performance.now();
    this.lastPoseTime = 0;
    this.lastPoseDetectedTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsTimer = performance.now();

    // Arm velocity tracking for flap gesture
    this.prevWristY = null;
    this.wristVelocity = 0;

    // Initialize Gender Detector Client (2.0s reset timeout)
    this.genderDetector = new GenderDetector({
      resetTimeoutMs: 2000,
      onStateChange: (state) => this.onGenderStateChange(state),
      onProgress: (progress, gender, conf) => this.onGenderProgress(progress, gender, conf)
    });

    this.init();
  }

  async init() {
    this.updateStatus('loading', 'Initializing camera & 3D scene...');

    try {
      // 1. Setup Three.js 3D Scene
      this.threeScene = new ThreeScene(this.threeCanvas);

      // 2. Setup Compositor
      this.compositor = new Compositor(this.bgCanvas, this.fgCanvas, this.video);

      // 3. Setup 3D Wings Controller & Load hiswings.glb
      this.wingsController = new WingsController(
        this.threeScene.getScene(),
        this.threeScene.getCamera()
      );

      try {
        await this.wingsController.loadModel('./models/hiswings.glb');
      } catch (err) {
        console.warn('Model load notice:', err);
      }

      // 4. Setup Floating Feather Particle System
      this.particles = new ParticleSystem(this.threeScene.getScene(), 90);

      // 5. Initialize Camera
      this.cameraManager = new CameraManager(this.video);
      try {
        await this.cameraManager.initialize('user');
      } catch (err) {
        console.error('Camera permission required:', err);
        this.updateStatus('idle', 'Camera access required');
      }

      // 6. Handle Window Resizing
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      // 7. Setup MediaPipe Pose Tracker
      try {
        this.poseTracker = new PoseTracker((results) => this.onPoseResults(results));
      } catch (e) {
        console.error('Pose tracker error:', e);
      }

      // 8. Bind UI Events
      this.setupUIEvents();

      this.updateStatus('idle', 'Step in front of the mirror');
    } catch (err) {
      console.error('Initialization error:', err);
      this.updateStatus('idle', 'Step in front of the mirror');
    } finally {
      // 9. Start Main Loop
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  setupUIEvents() {
    this.btnCamera.addEventListener('click', async () => {
      this.updateStatus('loading', 'Switching camera...');
      await this.cameraManager.switchCamera();
      this.handleResize();
      this.updateStatus('idle', 'Camera switched');
    });

    this.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Capture Photo Button
    if (this.btnCapture) {
      this.btnCapture.addEventListener('click', () => this.captureSnapshot());
    }

    // Close QR Modal
    if (this.btnCloseQr) {
      this.btnCloseQr.addEventListener('click', () => this.closeQrModal());
    }
    if (this.qrBackdrop) {
      this.qrBackdrop.addEventListener('click', () => this.closeQrModal());
    }
  }

  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.threeScene.resize(width, height);
    this.compositor.resize(width, height);
  }

  onGenderProgress(progress, gender, conf) {
    if (this.genderDetector.getState() === 'analyzing') {
      const pct = Math.round(progress * 100);
      this.updateStatus('analyzing', `Analyzing user... ${pct}%`);
    }
  }

  onGenderStateChange(state) {
    if (state === 'male') {
      this.updateStatus('male', 'Male Detected');
      this.wingsController.hide();
      this.hideCaptureButton();
      this.showMaleInfoPage();
    } else if (state === 'female') {
      this.updateStatus('female', 'Female Detected — Wings Attached ✨');
      this.showCaptureButton();
      this.hideMaleInfoPage();
    } else if (state === 'analyzing') {
      this.updateStatus('analyzing', 'Detecting user gender...');
      this.wingsController.hide();
      this.hideCaptureButton();
      if (this.isInfoVisible) {
        this.hideMaleInfoPage();
      }
    } else { // 'idle'
      this.updateStatus('idle', 'Step in front of the mirror');
      this.wingsController.hide();
      this.hideCaptureButton();
      this.closeQrModal();
      if (this.isInfoVisible) {
        this.hideMaleInfoPage();
      }
    }
  }

  showCaptureButton() {
    if (this.captureBar) {
      this.captureBar.classList.remove('hidden');
    }
  }

  hideCaptureButton() {
    if (this.captureBar) {
      this.captureBar.classList.add('hidden');
    }
  }

  /**
   * Captures composite snapshot (camera + 3D wings + person occlusion) and sends to backend
   */
  async captureSnapshot() {
    if (this.isCapturing) return;
    this.isCapturing = true;

    // 1. Camera Flash Animation
    if (this.cameraFlash) {
      this.cameraFlash.classList.add('flash');
      setTimeout(() => this.cameraFlash.classList.remove('flash'), 300);
    }

    this.updateStatus('female', 'Saving your photo... ✨');

    try {
      // 2. Composite all 3 layers into a single high-res snapshot
      const w = this.bgCanvas.width || window.innerWidth;
      const h = this.bgCanvas.height || window.innerHeight;
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = w;
      snapCanvas.height = h;
      const ctx = snapCanvas.getContext('2d');

      // Layer 1: Background Camera Feed
      ctx.drawImage(this.bgCanvas, 0, 0, w, h);
      // Layer 2: 3D Angel Wings + Particles
      ctx.drawImage(this.threeCanvas, 0, 0, w, h);
      // Layer 3: Foreground Person Silhouette
      ctx.drawImage(this.fgCanvas, 0, 0, w, h);

      const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.92);

      // 3. Post to backend to save on disk and database.json
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/save_capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, gender: 'female' })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      this.updateStatus('female', 'Photo captured! Scan QR code ✨');
      this.showQrModal(result.claim_url, dataUrl);
    } catch (err) {
      console.error('Capture failed:', err);
      this.updateStatus('female', 'Capture failed. Please try again.');
    } finally {
      this.isCapturing = false;
    }
  }

  showQrModal(claimUrl, previewDataUrl) {
    if (!this.qrModal || !this.qrCanvas) return;

    // Render QR Code onto canvas
    QRCode.toCanvas(this.qrCanvas, claimUrl, {
      width: 170,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    if (this.qrPreviewImg) this.qrPreviewImg.src = previewDataUrl;
    if (this.qrUrlDisplay) this.qrUrlDisplay.textContent = claimUrl;

    this.qrModal.classList.remove('hidden');

    // 30s Countdown timer
    let remaining = 30;
    if (this.qrTimer) this.qrTimer.textContent = `Auto-closing in ${remaining}s`;

    if (this.qrCountdown) clearInterval(this.qrCountdown);
    this.qrCountdown = setInterval(() => {
      remaining--;
      if (this.qrTimer) this.qrTimer.textContent = `Auto-closing in ${remaining}s`;
      if (remaining <= 0) {
        this.closeQrModal();
      }
    }, 1000);
  }

  closeQrModal() {
    if (!this.qrModal) return;
    this.qrModal.classList.add('hidden');
    if (this.qrCountdown) {
      clearInterval(this.qrCountdown);
      this.qrCountdown = null;
    }
  }

  /**
   * GSAP Bottom-to-Top Transition: Slides Camera Layer up and Male Info Page in
   */
  showMaleInfoPage() {
    if (!this.cameraLayer || !this.maleInfoLayer) return;
    this.isInfoVisible = true;
    this.isAnimating = true;
    this.pendingReturn = false;

    gsap.killTweensOf([this.cameraLayer, this.maleInfoLayer]);

    // Reset male info starting position below screen
    gsap.set(this.maleInfoLayer, { y: '100%', opacity: 1 });

    // Swipe Camera Layer up
    gsap.to(this.cameraLayer, {
      y: '-100%',
      duration: 0.7,
      ease: 'power3.inOut'
    });

    // Slide Male Info Card up from bottom
    gsap.to(this.maleInfoLayer, {
      y: '0%',
      duration: 0.7,
      ease: 'power3.out',
      onComplete: () => {
        this.isAnimating = false;
        if (this.pendingReturn) {
          this.pendingReturn = false;
          this.hideMaleInfoPage();
        }
      }
    });

    // Stagger in trait cards
    gsap.fromTo(
      '.trait-item',
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, stagger: 0.08, duration: 0.4, ease: 'power2.out', overwrite: true }
    );
  }

  /**
   * GSAP Transition Back: Slides Male Info Page down and brings Camera Layer back
   */
  hideMaleInfoPage() {
    if (!this.cameraLayer || !this.maleInfoLayer) return;
    if (!this.isInfoVisible && !this.isAnimating) return;

    if (this.isAnimating) {
      this.pendingReturn = true;
      return;
    }

    this.isAnimating = true;
    this.pendingReturn = false;

    gsap.killTweensOf([this.cameraLayer, this.maleInfoLayer]);

    // Slide Male Info Page down to bottom
    gsap.to(this.maleInfoLayer, {
      y: '100%',
      duration: 0.6,
      ease: 'power3.inOut'
    });

    // Slide Camera Layer back into view from top
    gsap.to(this.cameraLayer, {
      y: '0%',
      duration: 0.6,
      ease: 'power3.out',
      onComplete: () => {
        this.isAnimating = false;
        this.isInfoVisible = false;
      }
    });
  }

  onPoseResults(results) {
    const now = performance.now();
    const isMirrored = this.cameraManager.isMirrored;

    // 1. Render 3-Layer Occlusion via Compositor and get exact crop rect
    const crop = this.compositor.render(results.segmentationMask, isMirrored);

    // 2. Check if person is detected
    const personDetected = Boolean(results.poseLandmarks && results.poseLandmarks.length > 0 && crop);
    if (personDetected) {
      this.lastPoseDetectedTime = now;
    }

    const genderState = this.genderDetector.getState();

    // 3. Process 3D Landmarks & Anchor Wings ON FEMALE ONLY
    if (personDetected && genderState === 'female') {
      const detected = this.wingsController.updateTransform(
        results.poseLandmarks,
        this.filterLS,
        this.filterRS,
        isMirrored,
        crop,
        now
      );

      // Track wrist movement for arm-flapping gesture
      const lw = results.poseLandmarks[15]; // Left Wrist
      const rw = results.poseLandmarks[16]; // Right Wrist
      if (lw && rw) {
        const currentWristY = (lw.y + rw.y) * 0.5;
        if (this.prevWristY !== null) {
          const rawVel = Math.abs(currentWristY - this.prevWristY) * 60.0;
          this.wristVelocity = this.wristVelocity * 0.7 + rawVel * 0.3; // Smooth velocity
        }
        this.prevWristY = currentWristY;
      }
    } else {
      // Hide wings for male, analyzing, or idle state
      this.wingsController.hide();
      this.prevWristY = null;
      this.wristVelocity = 0;
    }
  }

  loop(timestamp) {
    const delta = (timestamp - this.lastTime) / 1000.0;
    this.lastTime = timestamp;

    // 1. Render camera background video immediately on every frame
    if (this.video.readyState >= 2 && this.compositor) {
      this.compositor.renderBackground(this.cameraManager ? this.cameraManager.isMirrored : true);
    }

    // 2. Send latest frame to MediaPipe Pose with pacing (~30 FPS AI inference)
    if (this.poseTracker && this.video.readyState >= 2 && timestamp - this.lastPoseTime >= 32) {
      this.lastPoseTime = timestamp;
      this.poseTracker.sendFrame(this.video);
    }

    // 3. Continuous presence check & gender state update (2s timer on user exit)
    const isPersonPresent = Boolean(
      this.lastPoseDetectedTime && (timestamp - this.lastPoseDetectedTime < 500)
    );
    this.genderDetector.update(this.video, isPersonPresent, timestamp);

    // 4. Animate 3D wings (idle breathing + arm-flap gesture) on female
    if (this.genderDetector.isFemale()) {
      this.wingsController.animate(delta, this.wristVelocity);
      this.particles.update(delta);
    }

    // 5. Render Three.js 3D Layer
    if (this.threeScene) {
      this.threeScene.render();
    }

    // 6. Update FPS Monitor
    this.frameCount++;
    if (timestamp - this.fpsTimer >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = timestamp;
      this.fpsBadge.textContent = `${this.fps} FPS`;
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  updateStatus(type, message) {
    this.statusPill.className = `pill ${type}`;
    this.statusText.textContent = message;
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new ARWingsApp();
});
