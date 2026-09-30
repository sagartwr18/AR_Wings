import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * WingsController: Implements biomechanical symmetrical wing flapping via GPU vertex shaders,
 * smart 360° front/back depth awareness, theme switching (Celestial Pearl vs. Crimson Red),
 * and high shoulder-blade anchor with head-height arch matching Snapchat AR Wings.
 */
export class WingsController {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.wingsRoot = new THREE.Group();
    this.scene.add(this.wingsRoot);

    this.wingsModel = null;
    this.materials = [];
    this.isLoaded = false;
    this.flapPhase = 0;
    this.currentScale = 0;
    this.targetScale = 0;
    this.currentTheme = 'celestial'; // 'celestial' (Snapchat default) or 'crimson'

    // GPU Uniform for symmetrical biological wing flapping
    this.flapUniform = { value: 0.0 };

    // Pre-allocated vectors to eliminate GC pauses
    this._vX = new THREE.Vector3();
    this._vY = new THREE.Vector3();
    this._vZ = new THREE.Vector3();
    this._rotMatrix = new THREE.Matrix4();
    this._targetQuat = new THREE.Quaternion();
  }

  loadModel(modelUrl = './models/hiswings.glb') {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          this.wingsModel = gltf.scene;
          this.materials = [];

          this.wingsModel.traverse((child) => {
            if (child.isMesh && child.material) {
              const mat = child.material.clone();
              child.material = mat;
              this.materials.push(mat);

              mat.side = THREE.DoubleSide;
              mat.transparent = true;
              mat.depthWrite = true;
              mat.alphaTest = 0.02;
              mat.castShadow = true;

              // Inject symmetrical biological flapping into GPU vertex shader
              mat.onBeforeCompile = (shader) => {
                shader.uniforms.uFlapAngle = this.flapUniform;
                shader.vertexShader = `
                  uniform float uFlapAngle;
                ` + shader.vertexShader;

                shader.vertexShader = shader.vertexShader.replace(
                  '#include <begin_vertex>',
                  `
                  #include <begin_vertex>
                  // Biomechanical symmetrical wing flapping
                  float distFromSpine = abs(position.x);
                  float normalizedDist = clamp(distFromSpine / 2.0, 0.0, 1.0);
                  
                  // Progressive curvature from spine root to wingtips
                  float bendAngle = uFlapAngle * pow(normalizedDist, 1.15);
                  float s = sin(bendAngle);
                  float c = cos(bendAngle);
                  float signX = position.x >= 0.0 ? 1.0 : -1.0;

                  // Symmetrical fold: both wings sweep forward together & flare wide backward
                  transformed.z += s * distFromSpine * 0.85;
                  transformed.x = signX * (c * distFromSpine);
                  
                  // Natural vertical tip flexing
                  transformed.y += abs(s) * distFromSpine * 0.12;
                  `
                );
              };
            }
          });

          // Apply initial theme
          this.applyTheme(this.currentTheme);

          // Compute initial bounding box and center pivot at thoracic spine base
          const box = new THREE.Box3().setFromObject(this.wingsModel);
          const center = box.getCenter(new THREE.Vector3());

          // Re-center so origin (0,0,0) sits between shoulder blades
          this.baseOffsetX = -center.x;
          this.baseOffsetY = -center.y - 0.04; // Scapula pivot between shoulder blades
          this.baseOffsetZ = -center.z - 0.06; // Snug against back

          this.wingsModel.position.set(this.baseOffsetX, this.baseOffsetY, this.baseOffsetZ);

          this.wingsRoot.add(this.wingsModel);
          this.wingsRoot.visible = false;
          this.isLoaded = true;

          console.log('3D Wings loaded with GPU biomechanical flapping shader');
          resolve(this.wingsRoot);
        },
        undefined,
        (error) => {
          console.error('Failed to load hiswings.glb:', error);
          reject(error);
        }
      );
    });
  }

  setTheme(themeName) {
    this.currentTheme = themeName;
    this.applyTheme(themeName);
  }

  applyTheme(themeName) {
    for (const mat of this.materials) {
      if (themeName === 'crimson') {
        // Vibrant Crimson Red Theme
        mat.color.setHex(0xe61030);
        if (mat.emissive) mat.emissive.setHex(0x330008);
        mat.roughness = 0.45;
        mat.metalness = 0.1;
      } else {
        // Celestial Pearl (Snapchat Style)
        mat.color.setHex(0xecf3fc); // Pearlescent white with soft silver
        if (mat.emissive) mat.emissive.setHex(0x162c4a); // Ethereal icy-blue ambient glow
        mat.roughness = 0.35;
        mat.metalness = 0.18;
      }
      mat.needsUpdate = true;
    }
  }

  hide() {
    if (this.wingsRoot) {
      this.wingsRoot.visible = false;
    }
  }

  updateTransform(landmarks, filterLS, filterRS, isMirrored, crop, timestamp) {
    if (!this.isLoaded || !landmarks) {
      this.hide();
      return { detected: false, isFacingCamera: true };
    }

    const rawLS = landmarks[11]; // Left Shoulder
    const rawRS = landmarks[12]; // Right Shoulder
    const rawNose = landmarks[0]; // Nose (for 360° facing check)

    if (!rawLS || !rawRS || rawLS.visibility < 0.5 || rawRS.visibility < 0.5) {
      this.hide();
      return { detected: false, isFacingCamera: true };
    }
    this.wingsRoot.visible = true;

    // 1. Jitter Reduction via One-Euro Filter
    const ls = filterLS.filter(rawLS, timestamp);
    const rs = filterRS.filter(rawRS, timestamp);

    // 2. Convert Raw Video Landmarks into Visible Canvas Space
    const videoW = crop ? crop.videoW : 1;
    const videoH = crop ? crop.videoH : 1;
    const sx = crop ? crop.sx : 0;
    const sy = crop ? crop.sy : 0;
    const sw = crop ? crop.sw : videoW;
    const sh = crop ? crop.sh : videoH;

    const lsCanvasX = (ls.x * videoW - sx) / sw;
    const lsCanvasY = (ls.y * videoH - sy) / sh;
    const rsCanvasX = (rs.x * videoW - sx) / sw;
    const rsCanvasY = (rs.y * videoH - sy) / sh;

    // 3. Compute 3D Metric Anchor Point
    const midCanvasX = (lsCanvasX + rsCanvasX) * 0.5;
    const midCanvasY = (lsCanvasY + rsCanvasY) * 0.5;
    const midZ = (ls.z + rs.z) * 0.5;

    // Dynamic Frustum Calculation based on camera FOV and Aspect Ratio
    const targetZ = -midZ * 1.5 - 0.18;
    const distFromCamera = this.camera.position.z - targetZ;

    const vFovRad = (this.camera.fov * Math.PI) / 180.0;
    const visibleHeight = 2.0 * distFromCamera * Math.tan(vFovRad / 2.0);
    const visibleWidth = visibleHeight * this.camera.aspect;

    // Map canvas coordinates to camera world coordinates
    const mirrorMult = isMirrored ? -1.0 : 1.0;
    const targetX = (midCanvasX - 0.5) * visibleWidth * mirrorMult;

    // Natural shoulder-blade anchor (between scapulae, below neck)
    const targetY = -(midCanvasY - 0.5) * visibleHeight - 0.03;

    this.wingsRoot.position.set(targetX, targetY, targetZ);

    // 4. Compute 3D Orientation (Pitch, Yaw, Roll)
    const dx = isMirrored ? (lsCanvasX - rsCanvasX) : (rsCanvasX - lsCanvasX);
    const dy = -(rsCanvasY - lsCanvasY);
    const dz = isMirrored ? (ls.z - rs.z) : (rs.z - ls.z);
    this._vX.set(dx, dy, dz).normalize();

    // Upright Spine Vector Y
    this._vY.set(0, 1, 0);

    // Chest Normal Vector Z (Cross product)
    this._vZ.crossVectors(this._vX, this._vY).normalize();
    this._vX.crossVectors(this._vY, this._vZ).normalize(); // Re-orthogonalize

    // Align wings facing backward (-Z)
    this._rotMatrix.makeBasis(this._vX, this._vY, this._vZ.negate());
    this._targetQuat.setFromRotationMatrix(this._rotMatrix);
    this.wingsRoot.quaternion.slerp(this._targetQuat, 0.35);

    // 5. Smart 360° Depth Check (Facing Camera vs. Back Turned)
    // When facing camera: Nose is closer to camera than shoulders (rawNose.z < midZ)
    // When back is turned to camera (00:22 in Snap filter): Shoulders are closer than nose!
    const isFacingCamera = rawNose ? (rawNose.z <= midZ + 0.03) : true;

    // 6. Archangel Scale: Tips extend up to head level and wide past elbows
    const shoulderCanvasSpan = Math.hypot(rsCanvasX - lsCanvasX, rsCanvasY - lsCanvasY);
    const targetPhysicalSpan = shoulderCanvasSpan * visibleWidth;
    this.targetScale = Math.max(0.4, Math.min((targetPhysicalSpan / 4.01) * 4.8, 2.8));
    this.currentScale = this.currentScale === 0 ? this.targetScale : (this.currentScale * 0.82 + this.targetScale * 0.18);
    this.wingsRoot.scale.set(this.currentScale, this.currentScale, this.currentScale);

    return { detected: true, isFacingCamera };
  }

  animate(delta, wristVelocity = 0) {
    if (!this.wingsModel) return;

    // Smooth idle breathing flapping frequency
    const idleFreq = 2.2;
    const idleAmplitude = 0.28; // Expressive symmetrical flap angle

    // Gesture amplification: wings flap faster and wider when arms move
    const gestureAmplitude = Math.min(wristVelocity * 0.5, 0.45);
    const totalAmplitude = idleAmplitude + gestureAmplitude;

    this.flapPhase += delta * (idleFreq + wristVelocity * 4.2);
    const flapAngle = Math.sin(this.flapPhase) * totalAmplitude;

    // Feed symmetrical bend angle directly into GPU vertex shader!
    this.flapUniform.value = flapAngle;

    // Subtle gentle body float preserving base scapula offset
    const baseY = this.baseOffsetY !== undefined ? this.baseOffsetY : 0;
    this.wingsModel.position.y = baseY + Math.sin(this.flapPhase * 0.5) * 0.02;
  }
}
