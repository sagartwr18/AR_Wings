import * as THREE from 'three';

/**
 * ThreeScene: Manages the 3D scene, studio lighting, perspective camera,
 * and transparent WebGL renderer.
 */
export class ThreeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();

    // 1. Transparent WebGL Renderer with preserved drawing buffer for snapshot capture
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // 2. Perspective Camera (vertical FOV matching portrait orientation)
    const aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 50);
    this.camera.position.set(0, 0, 2.5); // 2.5 meters in front of origin

    this.setupLighting();
  }

  setupLighting() {
    // Soft ambient fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    this.scene.add(ambientLight);

    // Warm key light from top-front
    const keyLight = new THREE.DirectionalLight(0xfff8ee, 2.2);
    keyLight.position.set(1.2, 2.5, 3.0);
    this.scene.add(keyLight);

    // Luminous rim light from behind (illuminates red feather edges with radiant highlights)
    const rimLight = new THREE.DirectionalLight(0xffe8dc, 3.8);
    rimLight.position.set(0, 3.0, -2.5);
    this.scene.add(rimLight);

    // Subtle soft fill from below
    const bounceLight = new THREE.DirectionalLight(0xffffff, 0.8);
    bounceLight.position.set(-1.0, -2.0, 1.5);
    this.scene.add(bounceLight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.camera.aspect = width / (height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }
}
