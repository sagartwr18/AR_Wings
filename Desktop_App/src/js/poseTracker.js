import { Pose } from '@mediapipe/pose';

/**
 * PoseTracker: Wraps MediaPipe Pose and Selfie Segmentation.
 * Emits 33 3D skeletal landmarks and real-time alpha segmentation mask per frame.
 */
export class PoseTracker {
  constructor(onResultsCallback) {
    this.onResultsCallback = onResultsCallback;
    this.isProcessing = false;

    this.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 1,         // 0: Lite (fastest for low-end mobile), 1: Full (best accuracy)
      smoothLandmarks: true,       // Built-in landmark smoothing
      enableSegmentation: true,    // CRUCIAL: Person alpha mask for occlusion
      smoothSegmentation: true,    // Boundary antialiasing
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });

    this.pose.onResults(this.onResultsCallback);
  }

  async sendFrame(videoElement) {
    if (this.isProcessing || !videoElement || !videoElement.videoWidth) {
      return;
    }
    this.isProcessing = true;
    try {
      await this.pose.send({ image: videoElement });
    } catch (err) {
      console.error('MediaPipe pose send error:', err);
    } finally {
      this.isProcessing = false;
    }
  }
}
