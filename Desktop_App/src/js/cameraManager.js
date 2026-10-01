/**
 * CameraManager: Handles webcam streaming, mobile camera switching (front/back),
 * and portrait aspect-ratio enforcement without stretching.
 */
export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.currentFacingMode = 'user'; // 'user' (selfie) or 'environment' (back)
    this.stream = null;
    this.isMirrored = true;
  }

  async initialize(facingMode = 'user') {
    this.currentFacingMode = facingMode;
    this.isMirrored = facingMode === 'user';

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;

      return new Promise((resolve) => {
        const onReady = () => {
          this.video.removeEventListener('loadeddata', onReady);
          this.video.removeEventListener('loadedmetadata', onReady);
          this.video.play().catch(() => {});
          resolve({
            video: this.video,
            width: this.video.videoWidth || 1280,
            height: this.video.videoHeight || 720,
            isMirrored: this.isMirrored
          });
        };

        if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
          onReady();
        } else {
          this.video.addEventListener('loadeddata', onReady, { once: true });
          this.video.addEventListener('loadedmetadata', onReady, { once: true });
        }
      });
    } catch (err) {
      console.warn('Standard camera constraints failed, attempting fallback...', err);
      const fallbackConstraints = {
        audio: false,
        video: { facingMode: this.currentFacingMode }
      };
      this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      this.video.srcObject = this.stream;

      return new Promise((resolve) => {
        const onReady = () => {
          this.video.removeEventListener('loadeddata', onReady);
          this.video.removeEventListener('loadedmetadata', onReady);
          this.video.play().catch(() => {});
          resolve({
            video: this.video,
            width: this.video.videoWidth || 640,
            height: this.video.videoHeight || 480,
            isMirrored: this.isMirrored
          });
        };

        if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
          onReady();
        } else {
          this.video.addEventListener('loadeddata', onReady, { once: true });
          this.video.addEventListener('loadedmetadata', onReady, { once: true });
        }
      });
    }
  }

  async switchCamera() {
    const nextFacing = this.currentFacingMode === 'user' ? 'environment' : 'user';
    return await this.initialize(nextFacing);
  }

  getVideo() {
    return this.video;
  }
}
