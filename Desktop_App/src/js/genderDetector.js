/**
 * GenderDetector Client for AR Wings
 * Captures high-resolution video snapshots and communicates with the FairFace FastAPI service
 * with robust voting stabilization and 2-second auto-reset on user exit.
 */
export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.')) {
      return 'http://127.0.0.1:8000';
    }
  }
  return 'https://ar-wings-backend.onrender.com';
}

export class GenderDetector {
  constructor(options = {}) {
    const baseUrl = options.baseUrl || getApiBaseUrl();
    this.apiEndpoint = options.apiEndpoint || `${baseUrl}/predict_base64`;
    this.healthEndpoint = options.healthEndpoint || `${baseUrl}/health`;
    this.pollIntervalMs = options.pollIntervalMs || 250; // Check every 250ms for responsive tracking
    this.votingDurationMs = options.votingDurationMs || 1800; // 1.8s window to stabilize decision
    this.resetTimeoutMs = options.resetTimeoutMs || 2000; // Exactly 2 seconds reset when user steps away

    this.onStateChange = options.onStateChange || (() => {});
    this.onProgress = options.onProgress || (() => {});

    // State
    this.currentState = 'idle'; // 'idle' | 'analyzing' | 'male' | 'female'
    this.decisionMade = false;
    this.detectionStart = null;
    this.lastSeen = 0;
    this.predictions = [];
    this.isBackendOnline = false;

    // High resolution canvas for sharp face extraction
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.lastPollTime = 0;
    this.isRequestPending = false;

    this.checkHealth();
  }

  async checkHealth() {
    try {
      const res = await fetch(this.healthEndpoint);
      if (res.ok) {
        this.isBackendOnline = true;
        console.log('✅ Gender Detection Backend connected.');
      }
    } catch (err) {
      this.isBackendOnline = false;
      console.warn('⚠️ Gender Detection Backend not reachable at', this.healthEndpoint);
    }
  }

  /**
   * Called regularly in the animation loop
   * @param {HTMLVideoElement} videoElement
   * @param {boolean} isPersonPresent
   * @param {number} timestamp
   */
  update(videoElement, isPersonPresent, timestamp = performance.now()) {
    // 1. If person is NOT present, check if 2 seconds have elapsed since last seen
    if (!isPersonPresent) {
      if (this.lastSeen > 0 && (timestamp - this.lastSeen >= this.resetTimeoutMs)) {
        if (this.currentState !== 'idle') {
          this.reset();
        }
      }
      return;
    }

    // Person IS present
    this.lastSeen = timestamp;

    // If decision is locked, keep timestamp fresh so reset doesn't trigger while person stands there
    if (this.decisionMade) {
      return;
    }

    // Start analyzing state
    if (!this.detectionStart) {
      this.detectionStart = timestamp;
      this.setState('analyzing');
    }

    // 2. Poll inference at fast interval
    if (!this.isRequestPending && timestamp - this.lastPollTime >= this.pollIntervalMs) {
      this.lastPollTime = timestamp;
      this.sendInference(videoElement);
    }
  }

  async sendInference(videoElement) {
    if (!videoElement || videoElement.readyState < 2) return;

    this.isRequestPending = true;

    try {
      // Draw at 640x480 for high clarity face detection
      this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
      const dataUrl = this.canvas.toDataURL('image/jpeg', 0.85);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      this.handleInferenceResult(data);
    } catch (err) {
      // Backend request error
    } finally {
      this.isRequestPending = false;
    }
  }

  handleInferenceResult(data) {
    const now = performance.now();

    if (data.face_detected && data.gender) {
      this.lastSeen = now;
      this.predictions.push({
        gender: data.gender,
        confidence: data.confidence || 0.5,
        maleProb: data.male_prob || 0.5,
        femaleProb: data.female_prob || 0.5
      });

      const elapsed = now - (this.detectionStart || now);
      const progress = Math.min(1.0, elapsed / this.votingDurationMs);
      this.onProgress(progress, data.gender, data.confidence);

      // Finalize decision after voting duration with at least 4 valid samples
      if (elapsed >= this.votingDurationMs && this.predictions.length >= 4) {
        let maleScore = 0;
        let femaleScore = 0;

        for (const p of this.predictions) {
          maleScore += p.maleProb;
          femaleScore += p.femaleProb;
        }

        const finalGender = maleScore >= femaleScore ? 'male' : 'female';
        this.decisionMade = true;
        this.setState(finalGender);
      }
    }
  }

  setState(newState) {
    if (this.currentState === newState) return;
    this.currentState = newState;
    this.onStateChange(newState);
  }

  reset() {
    this.currentState = 'idle';
    this.decisionMade = false;
    this.detectionStart = null;
    this.lastSeen = 0;
    this.predictions = [];
    this.setState('idle');
  }

  isMale() {
    return this.currentState === 'male';
  }

  isFemale() {
    return this.currentState === 'female';
  }

  isAnalyzing() {
    return this.currentState === 'analyzing';
  }

  getState() {
    return this.currentState;
  }
}
