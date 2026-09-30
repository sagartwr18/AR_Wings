/**
 * Compositor: Implements the 3-layer depth illusion in real-time with
 * strict aspect-ratio preservation (object-fit: cover) to prevent stretching.
 *
 * Layer 1 (Bottom): Mirrored camera background video (aspect-ratio preserved).
 * Layer 2 (Middle): Three.js 3D WebGL Wings (rendered on transparent canvas).
 * Layer 3 (Top): Foreground person silhouette cutout (drawn over wings using segmentation mask).
 */
export class Compositor {
  constructor(bgCanvas, fgCanvas, videoElement) {
    this.bgCanvas = bgCanvas;
    this.fgCanvas = fgCanvas;
    this.video = videoElement;

    this.bgCtx = bgCanvas.getContext('2d', { alpha: false });
    this.fgCtx = fgCanvas.getContext('2d', { willReadFrequently: false });
    this.lastCrop = null;
  }

  resize(width, height) {
    if (this.bgCanvas.width !== width || this.bgCanvas.height !== height) {
      this.bgCanvas.width = width;
      this.bgCanvas.height = height;
      this.fgCanvas.width = width;
      this.fgCanvas.height = height;
    }
  }

  getCropRect(canvasW, canvasH) {
    const videoW = this.video.videoWidth;
    const videoH = this.video.videoHeight;
    if (!videoW || !videoH) {
      return { sx: 0, sy: 0, sw: canvasW, sh: canvasH, videoW: canvasW, videoH: canvasH };
    }

    const canvasAspect = canvasW / canvasH;
    const videoAspect = videoW / videoH;

    let sx = 0, sy = 0, sw = videoW, sh = videoH;

    if (videoAspect > canvasAspect) {
      // Video is wider than canvas: crop left & right borders evenly
      sw = videoH * canvasAspect;
      sx = (videoW - sw) / 2;
    } else {
      // Video is taller than canvas: crop top & bottom borders evenly
      sh = videoW / canvasAspect;
      sy = (videoH - sh) / 2;
    }

    return { sx, sy, sw, sh, videoW, videoH };
  }

  renderBackground(isMirrored = true) {
    const w = this.bgCanvas.width;
    const h = this.bgCanvas.height;
    if (!w || !h || !this.video || !this.video.videoWidth) return null;

    const crop = this.getCropRect(w, h);
    this.lastCrop = crop;

    this.bgCtx.save();
    if (isMirrored) {
      this.bgCtx.translate(w, 0);
      this.bgCtx.scale(-1, 1);
    }
    this.bgCtx.drawImage(
      this.video,
      crop.sx, crop.sy, crop.sw, crop.sh,
      0, 0, w, h
    );
    this.bgCtx.restore();
    return crop;
  }

  render(segmentationMask, isMirrored = true) {
    const w = this.bgCanvas.width;
    const h = this.bgCanvas.height;

    if (!w || !h || !this.video.videoWidth) return null;

    const crop = this.getCropRect(w, h);
    this.lastCrop = crop;

    // -------------------------------------------------------------
    // LAYER 1: Background Camera Feed (Preserves natural aspect ratio)
    // -------------------------------------------------------------
    this.bgCtx.save();
    if (isMirrored) {
      this.bgCtx.translate(w, 0);
      this.bgCtx.scale(-1, 1);
    }
    this.bgCtx.drawImage(
      this.video,
      crop.sx, crop.sy, crop.sw, crop.sh,
      0, 0, w, h
    );
    this.bgCtx.restore();

    // -------------------------------------------------------------
    // LAYER 3: Foreground Person Silhouette (Occludes the wings)
    // -------------------------------------------------------------
    this.fgCtx.clearRect(0, 0, w, h);

    if (segmentationMask) {
      this.fgCtx.save();

      // 1. Draw segmentation mask cropped to exact same canvas coordinates
      if (isMirrored) {
        this.fgCtx.translate(w, 0);
        this.fgCtx.scale(-1, 1);
      }
      this.fgCtx.drawImage(
        segmentationMask,
        crop.sx, crop.sy, crop.sw, crop.sh,
        0, 0, w, h
      );

      // 2. Keep only pixels of the guest where the mask is solid
      this.fgCtx.globalCompositeOperation = 'source-in';
      this.fgCtx.drawImage(
        this.video,
        crop.sx, crop.sy, crop.sw, crop.sh,
        0, 0, w, h
      );

      this.fgCtx.restore();
    }

    return crop;
  }
}
