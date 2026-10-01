import * as THREE from 'three';

/**
 * ParticleSystem: Generates floating ethereal feathers and glowing soft golden sparkles
 * around the guest and angel wings. Hidden by default on startup.
 */
export class ParticleSystem {
  constructor(scene, count = 70) {
    this.scene = scene;
    this.count = count;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 2.2;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;

      velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
      velocities[i * 3 + 1] = -(0.10 + Math.random() * 0.15); // Gentle downward drift
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.velocities = velocities;

    // Create a circular soft golden/white particle texture
    const particleTexture = this.generateParticleTexture();

    const material = new THREE.PointsMaterial({
      color: 0xfff0d0, // Soft warm golden-white starlight
      size: 0.035,
      map: particleTexture,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.visible = false; // Never show on startup, only with active wings
    this.scene.add(this.particles);
  }

  generateParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 240, 200, 0.8)');
    gradient.addColorStop(0.7, 'rgba(255, 215, 150, 0.25)');
    gradient.addColorStop(1, 'rgba(255, 200, 100, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
  }

  show() {
    this.particles.visible = true;
  }

  hide() {
    this.particles.visible = false;
  }

  update(delta) {
    if (!this.particles.visible) return;

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
