import * as mpPose from '@mediapipe/pose';

/**
 * PoseTracker: Wraps MediaPipe Pose and Selfie Segmentation.
 * Emits 33 3D skeletal landmarks and real-time alpha segmentation mask per frame.
 */
export class PoseTracker {
  constructor(onResultsCallback) {
    this.onResultsCallback = onResultsCallback;
    this.isProcessing = false;
    this.pose = null;

    const PoseClass = (typeof window !== 'undefined' && window.Pose) ||
      (mpPose && mpPose.Pose) ||
      (mpPose && mpPose.default && mpPose.default.Pose) ||
      (mpPose && mpPose.default);

    if (!PoseClass) {
      console.warn('⚠️ MediaPipe Pose constructor not immediately available, waiting for script load...');
      return;
    }

    try {
      this.pose = new PoseClass({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
      });

      this.pose.setOptions({
        modelComplexity: 1,         // 0: Lite, 1: Full (best accuracy)
        smoothLandmarks: true,       // Built-in landmark smoothing
        enableSegmentation: true,    // Person alpha mask for occlusion
        smoothSegmentation: true,    // Boundary antialiasing
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55
      });

      this.pose.onResults(this.onResultsCallback);
      console.log('✅ MediaPipe Pose Tracker initialized successfully.');
    } catch (err) {
      console.error('Failed to initialize MediaPipe Pose:', err);
    }
  }

  async sendFrame(videoElement) {
    if (!this.pose && typeof window !== 'undefined' && window.Pose) {
      try {
        this.pose = new window.Pose({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`
        });
        this.pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: true,
          smoothSegmentation: true,
          minDetectionConfidence: 0.55,
          minTrackingConfidence: 0.55
        });
        this.pose.onResults(this.onResultsCallback);
      } catch (e) {
        console.error('Lazy init Pose failed:', e);
      }
    }

    if (!this.pose || this.isProcessing || !videoElement || !videoElement.videoWidth) {
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
