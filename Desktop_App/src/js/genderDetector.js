/**
 * GenderDetector Client for AR Wings
 * Ultra-fast FairFace classification with rapid consensus voting and 2-second auto-reset.
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
    this.pollIntervalMs = options.pollIntervalMs || 100; // Ultra-fast 100ms polling
    this.votingDurationMs = options.votingDurationMs || 450; // Rapid 450ms consensus window
    this.resetTimeoutMs = options.resetTimeoutMs || 2000; // 2 seconds auto-reset when person steps away

    this.onStateChange = options.onStateChange || (() => {});
    this.onProgress = options.onProgress || (() => {});

    // State
    this.currentState = 'idle'; // 'idle' | 'analyzing' | 'male' | 'female'
    this.decisionMade = false;
    this.detectionStart = null;
    this.lastSeen = 0;
    this.predictions = [];
    this.isBackendOnline = false;

    // Optimized canvas for fast upload (320x240 @ 0.70 jpeg = ~8KB per frame)
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
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
      }
    } catch (err) {
      this.isBackendOnline = false;
    }
  }

  /**
   * Called in the animation loop
   * @param {HTMLVideoElement} videoElement
   * @param {boolean} isPersonPresent
   * @param {number} timestamp
   */
  update(videoElement, isPersonPresent, timestamp = performance.now()) {
    // 1. If person is NOT in frame, auto-reset after 2 seconds
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

    // Start analyzing state immediately
    if (!this.detectionStart) {
      this.detectionStart = timestamp;
      this.setState('analyzing');
    }

    // 2. Poll inference at ultra-fast interval
    if (!this.isRequestPending && timestamp - this.lastPollTime >= this.pollIntervalMs) {
      this.lastPollTime = timestamp;
      this.sendInference(videoElement);
    }
  }

  async sendInference(videoElement) {
    if (!videoElement || videoElement.readyState < 2) return;

    this.isRequestPending = true;

    try {
      this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
      const dataUrl = this.canvas.toDataURL('image/jpeg', 0.70);

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
      // Ignore network flutter
    } finally {
      this.isRequestPending = false;
    }
  }

  handleInferenceResult(data) {
    const now = performance.now();

    if (data.face_detected && data.gender) {
      this.lastSeen = now;
      const maleProb = data.male_prob || (data.gender.toLowerCase() === 'male' ? 0.85 : 0.15);
      const femaleProb = data.female_prob || (data.gender.toLowerCase() === 'female' ? 0.85 : 0.15);
      const confidence = data.confidence || Math.max(maleProb, femaleProb);

      this.predictions.push({
        gender: data.gender.toLowerCase(),
        confidence,
        maleProb,
        femaleProb
      });

      const elapsed = now - (this.detectionStart || now);
      const progress = Math.min(1.0, elapsed / this.votingDurationMs);
      this.onProgress(progress, data.gender, confidence);

      // Instant Decision Trigger:
      // A) 2 consecutive high-confidence predictions (>0.70)
      // B) Or 3 predictions received after 350ms
      const count = this.predictions.length;
      const recent = this.predictions.slice(-2);
      const isConsistentlyMale = recent.length >= 2 && recent.every(p => p.gender === 'male' && p.maleProb >= 0.60);
      const isConsistentlyFemale = recent.length >= 2 && recent.every(p => p.gender === 'female' && p.femaleProb >= 0.60);

      if (isConsistentlyMale || isConsistentlyFemale || (count >= 3 && elapsed >= this.votingDurationMs)) {
        let maleSum = 0;
        let femaleSum = 0;
        for (const p of this.predictions) {
          maleSum += p.maleProb;
          femaleSum += p.femaleProb;
        }

        const finalGender = maleSum >= femaleSum ? 'male' : 'female';
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

  getState() {
    return this.currentState;
  }

  isMale() {
    return this.currentState === 'male';
  }

  isFemale() {
    return this.currentState === 'female';
  }
}
