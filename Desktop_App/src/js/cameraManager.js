/**
 * CameraManager: Handles webcam streaming, mobile camera switching (front/back),
 * and portrait aspect-ratio enforcement.
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

    const idealWidth = window.innerHeight > window.innerWidth ? 1080 : 1920;
    const idealHeight = window.innerHeight > window.innerWidth ? 1920 : 1080;

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.currentFacingMode },
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
        frameRate: { ideal: 60, min: 30 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;

      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve({
            video: this.video,
            width: this.video.videoWidth,
            height: this.video.videoHeight,
            isMirrored: this.isMirrored
          });
        };
      });
    } catch (err) {
      console.warn('High-res camera constraints failed, attempting fallback...', err);
      // Fallback to basic video constraint without resolution hints
      const fallbackConstraints = {
        audio: false,
        video: { facingMode: this.currentFacingMode }
      };
      this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      this.video.srcObject = this.stream;

      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve({
            video: this.video,
            width: this.video.videoWidth,
            height: this.video.videoHeight,
            isMirrored: this.isMirrored
          });
        };
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
