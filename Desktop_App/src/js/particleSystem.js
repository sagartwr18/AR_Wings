import * as THREE from 'three';

/**
 * ParticleSystem: Generates floating ethereal feathers and glowing sparkles
 * around the guest and angel wings.
 */
export class ParticleSystem {
  constructor(scene, count = 100) {
    this.scene = scene;
    this.count = count;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 2.2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;

      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.08;
      velocities[i * 3 + 1] = -(0.15 + Math.random() * 0.25); // Gentle downward drift
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;

      scales[i] = Math.random() * 0.5 + 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.velocities = velocities;

    // Create a circular soft particle texture programmatically
    const particleTexture = this.generateParticleTexture();

    const material = new THREE.PointsMaterial({
      color: 0xff3b52, // Glowing crimson ember color
      size: 0.05,
      map: particleTexture,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  generateParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 230, 220, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 60, 80, 0.9)');
    gradient.addColorStop(0.7, 'rgba(200, 20, 40, 0.3)');
    gradient.addColorStop(1, 'rgba(150, 0, 20, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
  }

  update(delta) {
    const pos = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      pos[i * 3 + 0] += this.velocities[i * 3 + 0] * delta;
      pos[i * 3 + 1] += this.velocities[i * 3 + 1] * delta;
      pos[i * 3 + 2] += this.velocities[i * 3 + 2] * delta;

      // Respawn at top if fallen below view
      if (pos[i * 3 + 1] < -1.8) {
        pos[i * 3 + 1] = 1.8;
        pos[i * 3 + 0] = (Math.random() - 0.5) * 2.2;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }
}
