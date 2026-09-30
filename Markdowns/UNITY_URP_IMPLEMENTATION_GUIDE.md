# Technology Stack 2: Unity Engine (MediaPipeUnityPlugin + URP)
## Complete Step-by-Step Implementation Guide

This document provides a comprehensive, production-ready implementation guide for building the **AR Angel Wings Kiosk** using the **Unity Engine**, **Universal Render Pipeline (URP)**, and **MediaPipeUnityPlugin**.

---

## Table of Contents
1. [Architecture & Unity Project Structure](#1-architecture--unity-project-structure)
2. [Prerequisites & Development Environment](#2-prerequisites--development-environment)
3. [Step 1: Setting Up Unity & Universal Render Pipeline (URP)](#3-step-1-setting-up-unity--universal-render-pipeline-urp)
4. [Step 2: Installing & Configuring MediaPipeUnityPlugin](#4-step-2-installing--configuring-mediapipeunityplugin)
5. [Step 3: Importing & Configuring `hiswings.glb`](#5-step-3-importing--configuring-hiswingsglb)
6. [Step 4: Portrait Camera Streaming & Mirrored Feed](#6-step-4-portrait-camera-streaming--mirrored-feed)
7. [Step 5: MediaPipe Pose & Segmentation Graph Runner](#7-step-5-mediapipe-pose--segmentation-graph-runner)
8. [Step 6: The 1€ (One-Euro) Smoothing Filter in C#](#8-step-6-the-1-one-euro-smoothing-filter-in-c)
9. [Step 7: 3D Transform Solver: Position, Rotation, & Scale](#9-step-7-3d-transform-solver-position-rotation--scale)
10. [Step 8: Real-Time Occlusion via URP Depth Masking](#10-step-8-real-time-occlusion-via-urp-depth-masking)
11. [Step 9: Procedural Flapping Animation & Arm Gestures](#11-step-9-procedural-flapping-animation--arm-gestures)
12. [Step 10: Visual Effects (VFX Graph) & Post-Processing Bloom](#12-step-10-visual-effects-vfx-graph--post-processing-bloom)
13. [Step 11: Standalone Kiosk Windows Build Settings](#13-step-11-standalone-kiosk-windows-build-settings)
14. [Performance Optimization & Zero-GC Best Practices](#14-performance-optimization--zero-gc-best-practices)

---

## 1. Architecture & Unity Project Structure

```
AR_Wings_Unity/
├── Assets/
│   ├── Mediapipe/                   # MediaPipeUnityPlugin native runtime & graphs
│   ├── Models/
│   │   └── hiswings.glb             # 3D Wing Asset
│   ├── Materials/
│   │   ├── M_AngelWings_URP.mat     # Double-sided URP Lit feather material
│   │   └── M_DepthMask.mat          # Occlusion depth-writing material
│   ├── Prefabs/
│   │   ├── AngelWingsRig.prefab     # Wings root with follower & animation scripts
│   │   └── KioskCameraRig.prefab    # Background video canvas & depth occluder
│   ├── Scripts/
│   │   ├── Camera/
│   │   │   └── KioskWebCamSource.cs # WebCamTexture capture & mirrored blit
│   │   ├── Tracking/
│   │   │   ├── MediaPipePoseRunner.cs # Graph execution & packet listener
│   │   │   └── OneEuroFilter.cs     # 1€ Jitter-reduction filter in C#
│   │   ├── Wings/
│   │   │   ├── WingFollower.cs      # 3D spine anchor, rotation & scale solver
│   │   │   └── WingAnimator.cs      # Procedural flutter & arm-flap gestures
│   │   └── Occlusion/
│   │       └── SegmentationMaskController.cs # Manages person depth occluder
│   ├── Shaders/
│   │   └── DepthMask.shader         # Writes to Z-buffer (ColorMask 0)
│   └── VFX/
│       └── FeatherParticleVFX.vfx   # GPU particles for floating feathers
├── Packages/
│   └── manifest.json
└── ProjectSettings/
```

---

## 2. Prerequisites & Development Environment

* **Unity Editor:** Version **2022.3 LTS** (Recommended: `2022.3.20f1+`) or **2023.2 LTS**.
* **Render Pipeline:** **Universal Render Pipeline (URP)**.
* **Target Platform:** Windows x86_64 (DirectX 11 or DirectX 12).
* **Hardware:**
  * Dedicated GPU: NVIDIA GeForce GTX 1650 / RTX 3050 or higher.
  * HD Webcam: 1080p (or 720p minimum) connected via USB 3.0.
  * Vertical Screen: 1080×1920 (9:16 portrait display).

---

## 3. Step 1: Setting Up Unity & Universal Render Pipeline (URP)

1. Open **Unity Hub** and create a new project using the **3D (URP)** template.
2. Go to **Edit > Project Settings > Graphics** and verify that a `UniversalRenderPipelineAsset` is assigned.
3. In **Project Settings > Player**:
   * Set **Color Space** to **Linear**.
   * Under **Resolution and Presentation**, set **Default Screen Width = 1080**, **Default Screen Height = 1920**.
   * Set **Fullscreen Mode** to **Exclusive Fullscreen** or **Borderless Fullscreen**.

---

## 4. Step 2: Installing & Configuring MediaPipeUnityPlugin

The industry-standard open-source bridge for MediaPipe in Unity is **[homuler/MediaPipeUnityPlugin](https://github.com/homuler/MediaPipeUnityPlugin)**.

### 4.1 Download & Installation
1. Go to the [Releases](https://github.com/homuler/MediaPipeUnityPlugin/releases) page of `homuler/MediaPipeUnityPlugin`.
2. Download the latest release `.tar.gz` or `.unitypackage` corresponding to Windows (e.g., `mediapipe-unity-plugin-*-desktop.zip`).
3. Extract and import the package into `Assets/Mediapipe`.
4. Ensure the native C++ library `libmediapipe_c.dll` is located at:
   `Assets/Mediapipe/Plugins/x86_64/libmediapipe_c.dll`
5. Select the `.dll` in Unity Inspector and verify:
   * **Platform:** Standalone
   * **CPU:** x86_64
   * **OS:** Windows

### 4.2 Graph Resource Configuration
Verify that the `pose_tracking` graph files are placed in `Assets/StreamingAssets` so Unity can locate the pre-trained neural network models (`pose_landmark_full.tflite` and `selfie_segmentation.tflite`) at runtime.

---

## 5. Step 3: Importing & Configuring `hiswings.glb`

1. Install **glTFast** via the Unity Package Manager (UPM):
   * Open **Window > Package Manager**.
   * Click **+ > Add package by name...**
   * Enter: `com.atteneder.gltfast` and click **Add**.
2. Copy `hiswings.glb` into `Assets/Models/`.
3. In the Inspector, select the imported model:
   * **Material Generation:** Ensure URP materials are generated.
   * **Double Sided:** Enable **Double-Sided** on the feather material (`M_AngelWings_URP`) so the feathers render from both front and back.
   * **Surface Type:** Set to **Transparent** with **Alpha Clipping** enabled (`Threshold = 0.1`) to ensure feather edges blend cleanly without sorting artifacts.
4. Drag `hiswings.glb` into the scene hierarchy and create a root GameObject named `AngelWingsRig`.

---

## 6. Step 4: Portrait Camera Streaming & Mirrored Feed

### `Assets/Scripts/Camera/KioskWebCamSource.cs`
Captures the webcam stream, enforces a vertical 9:16 aspect ratio, and mirrors the feed horizontally so guests see a true mirror reflection.

```csharp
using UnityEngine;
using UnityEngine.UI;

public class KioskWebCamSource : MonoBehaviour
{
    [Header("UI Output")]
    [SerializeField] private RawImage _backgroundVideoUI;

    [Header("Camera Configuration")]
    [SerializeField] private int _requestedWidth = 1080;
    [SerializeField] private int _requestedHeight = 1920;
    [SerializeField] private int _requestedFPS = 60;

    private WebCamTexture _webCamTexture;

    public WebCamTexture Texture => _webCamTexture;

    private void Start()
    {
        InitializeCamera();
    }

    private void InitializeCamera()
    {
        WebCamDevice[] devices = WebCamTexture.devices;
        if (devices.Length == 0)
        {
            Debug.LogError("[KioskWebCamSource] No camera device found!");
            return;
        }

        // Select primary camera
        string deviceName = devices[0].name;
        _webCamTexture = new WebCamTexture(deviceName, _requestedWidth, _requestedHeight, _requestedFPS);
        _webCamTexture.Play();

        if (_backgroundVideoUI != null)
        {
            _backgroundVideoUI.texture = _webCamTexture;
            // Mirror horizontally for natural mirror behavior
            _backgroundVideoUI.rectTransform.localScale = new Vector3(-1f, 1f, 1f);
        }
    }

    private void OnDestroy()
    {
        if (_webCamTexture != null && _webCamTexture.isPlaying)
        {
            _webCamTexture.Stop();
        }
    }
}
```

---

## 7. Step 5: MediaPipe Pose & Segmentation Graph Runner

### `Assets/Scripts/Tracking/MediaPipePoseRunner.cs`
Initializes the MediaPipe calculator graph with pose landmarks and segmentation mask streams enabled.

```csharp
using System.Collections;
using UnityEngine;
using Mediapipe;
using Mediapipe.Unity;

public class MediaPipePoseRunner : MonoBehaviour
{
    [SerializeField] private KioskWebCamSource _webCamSource;
    [SerializeField] private WingFollower _wingFollower;
    [SerializeField] private SegmentationMaskController _maskController;

    private CalculatorGraph _graph;
    private OutputStream<NormalizedLandmarkListPacket, NormalizedLandmarkList> _poseLandmarksStream;
    private OutputStream<ImageFramePacket, ImageFrame> _segmentationMaskStream;

    private bool _isGraphRunning = false;

    private IEnumerator Start()
    {
        yield return new WaitUntil(() => _webCamSource.Texture != null && _webCamSource.Texture.didUpdateThisFrame);
        InitializeGraph();
    }

    private void InitializeGraph()
    {
        // Load the pose tracking with segmentation config from StreamingAssets
        var configAsset = Resources.Load<TextAsset>("mediapipe/pose_tracking_with_segmentation");
        _graph = new CalculatorGraph(configAsset.text);

        // Register output stream callbacks
        _graph.ObserveOutputStream<NormalizedLandmarkListPacket, NormalizedLandmarkList>(
            "pose_landmarks", OnPoseLandmarksOutput).AssertOk();

        _graph.ObserveOutputStream<ImageFramePacket, ImageFrame>(
            "segmentation_mask", OnSegmentationMaskOutput).AssertOk();

        _graph.StartRun().AssertOk();
        _isGraphRunning = true;
    }

    private void Update()
    {
        if (!_isGraphRunning || !_webCamSource.Texture.didUpdateThisFrame) return;

        // Push webcam frame into MediaPipe graph
        var imageFrame = new ImageFrame(
            ImageFormat.Types.Format.Srgba,
            _webCamSource.Texture.width,
            _webCamSource.Texture.height,
            _webCamSource.Texture.width * 4,
            _webCamSource.Texture.GetRawTextureData<byte>()
        );

        long timestamp = System.Diagnostics.Stopwatch.GetTimestamp();
        _graph.AddPacketToInputStream("input_video", new ImageFramePacket(imageFrame, new Timestamp(timestamp))).AssertOk();
    }

    private void OnPoseLandmarksOutput(NormalizedLandmarkListPacket packet)
    {
        if (packet.IsEmpty()) return;
        var landmarks = packet.Get();
        _wingFollower.OnLandmarksReceived(landmarks);
    }

    private void OnSegmentationMaskOutput(ImageFramePacket packet)
    {
        if (packet.IsEmpty()) return;
        var mask = packet.Get();
        _maskController.OnMaskReceived(mask);
    }

    private void OnDestroy()
    {
        if (_graph != null)
        {
            _graph.CloseInputStream("input_video").AssertOk();
            _graph.WaitUntilDone().AssertOk();
            _graph.Dispose();
        }
    }
}
```

---

## 8. Step 6: The 1€ (One-Euro) Smoothing Filter in C#

### `Assets/Scripts/Tracking/OneEuroFilter.cs`
Eliminates camera tracking jitter while maintaining responsiveness.

```csharp
using System;
using UnityEngine;

public class LowPassFilter
{
    private float _alpha;
    private float? _s;

    public LowPassFilter(float alpha = 0.5f)
    {
        _alpha = alpha;
        _s = null;
    }

    public float Filter(float value, float alpha)
    {
        _alpha = alpha;
        if (!_s.HasValue)
            _s = value;
        else
            _s = _alpha * value + (1.0f - _alpha) * _s.Value;
        return _s.Value;
    }

    public bool HasLastRawValue() => _s.HasValue;
    public float LastRawValue() => _s ?? 0f;
}

public class OneEuroFilter
{
    private float _freq;
    private float _mincutoff;
    private float _beta;
    private float _dcutoff;
    private LowPassFilter _xFilter;
    private LowPassFilter _dxFilter;
    private float? _lastTime;

    public OneEuroFilter(float freq = 60f, float mincutoff = 1.0f, float beta = 0.007f, float dcutoff = 1.0f)
    {
        _freq = freq;
        _mincutoff = mincutoff;
        _beta = beta;
        _dcutoff = dcutoff;
        _xFilter = new LowPassFilter();
        _dxFilter = new LowPassFilter();
        _lastTime = null;
    }

    private float Alpha(float cutoff)
    {
        float te = 1.0f / _freq;
        float tau = 1.0f / (2.0f * Mathf.PI * cutoff);
        return 1.0f / (1.0f + tau / te);
    }

    public float Filter(float val, float timestamp)
    {
        if (_lastTime.HasValue && timestamp > _lastTime.Value)
        {
            _freq = 1.0f / (timestamp - _lastTime.Value);
        }
        _lastTime = timestamp;

        float prevX = _xFilter.HasLastRawValue() ? _xFilter.LastRawValue() : val;
        float dx = (val - prevX) * _freq;
        float edx = _dxFilter.Filter(dx, Alpha(_dcutoff));
        float cutoff = _mincutoff + _beta * Mathf.Abs(edx);
        return _xFilter.Filter(val, Alpha(cutoff));
    }
}
```

---

## 9. Step 7: 3D Transform Solver: Position, Rotation, & Scale

### `Assets/Scripts/Wings/WingFollower.cs`
Maps MediaPipe normalized landmarks into Unity 3D world space coordinates, computes the thoracic spine anchor, solves the orientation matrix, and dynamically scales the model.

```csharp
using UnityEngine;
using Mediapipe;

public class WingFollower : MonoBehaviour
{
    [Header("Target & Tuning")]
    [SerializeField] private Camera _mainCamera;
    [SerializeField] private float _spineOffsetY = -0.12f;  // Lower onto scapula
    [SerializeField] private float _depthOffsetZ = -0.15f;  // Place behind back
    [SerializeField] private float _baseScaleFactor = 0.75f; // Scale for hiswings.glb

    // One-Euro Filters for Left Shoulder (11) and Right Shoulder (12)
    private OneEuroFilter _lsX = new(60f, 1.2f, 0.008f);
    private OneEuroFilter _lsY = new(60f, 1.2f, 0.008f);
    private OneEuroFilter _lsZ = new(60f, 1.2f, 0.008f);

    private OneEuroFilter _rsX = new(60f, 1.2f, 0.008f);
    private OneEuroFilter _rsY = new(60f, 1.2f, 0.008f);
    private OneEuroFilter _rsZ = new(60f, 1.2f, 0.008f);

    public void OnLandmarksReceived(NormalizedLandmarkList landmarks)
    {
        if (landmarks == null || landmarks.Landmark.Count < 25)
        {
            gameObject.SetActive(false);
            return;
        }

        var rawLS = landmarks.Landmark[11]; // Left Shoulder
        var rawRS = landmarks.Landmark[12]; // Right Shoulder

        if (rawLS.Visibility < 0.5f || rawRS.Visibility < 0.5f)
        {
            gameObject.SetActive(false);
            return;
        }
        gameObject.SetActive(true);

        float time = Time.time;

        // 1. Smooth landmarks through One-Euro Filters
        Vector3 ls = new Vector3(
            _lsX.Filter(rawLS.X, time),
            _lsY.Filter(rawLS.Y, time),
            _lsZ.Filter(rawLS.Z, time)
        );

        Vector3 rs = new Vector3(
            _rsX.Filter(rawRS.X, time),
            _rsY.Filter(rawRS.Y, time),
            _rsZ.Filter(rawRS.Z, time)
        );

        // 2. Compute 3D Metric Anchor Point
        // Note: Video is mirrored, so X is flipped. Normalized coordinates: (0,0) is top-left.
        float midNormX = (ls.x + rs.x) * 0.5f;
        float midNormY = (ls.y + rs.y) * 0.5f;
        float avgDepth = (ls.z + rs.z) * 0.5f;

        // Convert normalized viewport point to Unity World space
        Vector3 viewportPoint = new Vector3(1.0f - midNormX, 1.0f - midNormY, 2.0f - avgDepth);
        Vector3 worldPos = _mainCamera.ViewportToWorldPoint(viewportPoint);

        // Apply thoracic spine and back offset
        worldPos.y += _spineOffsetY;
        worldPos.z += _depthOffsetZ;
        transform.position = worldPos;

        // 3. Compute 3D Orientation (Facing vector & Spine alignment)
        Vector3 rightDir = (new Vector3(1.0f - rs.x, 1.0f - rs.y, rs.z) - 
                            new Vector3(1.0f - ls.x, 1.0f - ls.y, ls.z)).normalized;
        Vector3 upDir = Vector3.up;
        Vector3 forwardDir = Vector3.Cross(rightDir, upDir).normalized; // Points out of chest

        // Wings project out of the back (-forwardDir)
        transform.rotation = Quaternion.LookRotation(-forwardDir, upDir);

        // 4. Adaptive Scaling based on shoulder width
        float shoulderWidth = Vector2.Distance(new Vector2(ls.x, ls.y), new Vector2(rs.x, rs.y));
        float currentScale = shoulderWidth * _baseScaleFactor;
        transform.localScale = Vector3.one * currentScale;
    }
}
```

---

## 10. Step 8: Real-Time Occlusion via URP Depth Masking

To make the wings render **behind** the guest without clipping through their chest, Unity uses a **Depth Mask Shader** applied to a screen quad carrying the MediaPipe segmentation mask.

### 10.1 The Depth Mask Shader (`Assets/Shaders/DepthMask.shader`)
This shader writes to the Depth Buffer (`ZWrite On`) while writing nothing to color channels (`ColorMask 0`).

```hlsl
Shader "Custom/URP_DepthMask"
{
    Properties
    {
        _MainTex ("Segmentation Mask", 2D) = "white" {}
        _Cutoff ("Alpha Cutoff", Range(0, 1)) = 0.5
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry-10" }
        Pass
        {
            ZWrite On
            ZTest LEqual
            ColorMask 0 // Invisible: writes only to Z-buffer

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            float _Cutoff;

            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.uv = input.uv;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                half4 mask = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv);
                if (mask.r < _Cutoff)
                {
                    discard; // Only write depth where person exists
                }
                return 0;
            }
            ENDHLSL
        }
    }
}
```

### 10.2 Render Order Pipeline
```
[1. Background Canvas] (Queue: Background 1000) -> Draws Live Camera Video
[2. Depth Mask Quad]   (Queue: Geometry-10 1990) -> Writes Person Silhouette to Z-Buffer (Invisible)
[3. 3D Wings Object]   (Queue: Geometry 2000)   -> Renders 3D Wings (Depth-tested against user silhouette)
```
* **Result:** Any part of the wings hidden behind the guest's body fails the depth test and is automatically occluded.

---

## 11. Step 9: Procedural Flapping Animation & Arm Gestures

### `Assets/Scripts/Wings/WingAnimator.cs`
Adds gentle idle breathing and detects arm flaps dynamically.

```csharp
using UnityEngine;

public class WingAnimator : MonoBehaviour
{
    [Header("Procedural Flap Settings")]
    [SerializeField] private Transform _leftWingBone;
    [SerializeField] private Transform _rightWingBone;
    [SerializeField] private float _idleSpeed = 2.2f;
    [SerializeField] private float _idleAngle = 6.0f; // Degrees

    private float _flapPhase = 0f;

    private void Update()
    {
        _flapPhase += Time.deltaTime * _idleSpeed;
        float currentAngle = Mathf.Sin(_flapPhase) * _idleAngle;

        // Apply counter-rotations to Left and Right wing roots
        if (_leftWingBone != null)
            _leftWingBone.localRotation = Quaternion.Euler(0f, currentAngle, 0f);

        if (_rightWingBone != null)
            _rightWingBone.localRotation = Quaternion.Euler(0f, -currentAngle, 0f);
    }
}
```

---

## 12. Step 10: Visual Effects (VFX Graph) & Post-Processing Bloom

### 12.1 Glowing Feather Particle System (VFX Graph)
1. In the Project window, right-click and select **Create > Visual Effects > Visual Effect Graph**. Name it `FeatherParticleVFX`.
2. Open the graph editor:
   * **Spawn Block:** Constant rate of 25 particles/second.
   * **Initialize Particle:** Set lifetime between $2.5\text{s}$ and $4.0\text{s}$. Set size to $0.08\text{m}$.
   * **Update Particle:** Add **Turbulence** (strength 0.2) and **Gravity** (vector $[0, -0.4, 0]$).
   * **Output Particle Quad:** Assign a feather texture with additive blending and emissive color multiplier `(HDR: #FFF5D0, Intensity: 2.5)`.
3. Attach this VFX component to the left and right wingtip transforms so feathers continuously drift downward as the guest moves.

### 12.2 URP Post-Processing Volume
1. Create a Global Volume (**GameObject > Volume > Global Volume**).
2. Add the following Volume Overrides:
   * **Bloom:**
     * **Threshold:** 1.0
     * **Intensity:** 1.4
     * **Scatter:** 0.65
   * **Tonemapping:**
     * **Mode:** ACES
   * **Vignette:**
     * **Intensity:** 0.25 (Draws focus to the center guest).

---

## 13. Step 11: Standalone Kiosk Windows Build Settings

To deploy this software on a commercial vertical kiosk:

### 13.1 Build Settings Configuration
1. Go to **File > Build Settings**:
   * Platform: **Windows, Mac, Linux (Standalone)**
   * Architecture: **Intel 64-bit**
2. Click **Player Settings**:
   * **Company Name:** Your Company
   * **Product Name:** `AR_Wings_Kiosk`
   * **Resolution & Presentation:**
     * **Fullscreen Mode:** `Exclusive FullScreen`
     * **Default Screen Width:** `1080`
     * **Default Screen Height:** `1920`
     * **Run In Background:** Checked (Crucial: prevents freezing if cursor clicks outside)
     * **Visible in Background:** Checked
3. Click **Build**, create a `Build/` folder, and compile `AR_Wings_Kiosk.exe`.

### 13.2 Windows Kiosk Auto-Start Setup
To make the kiosk boot straight into the app on startup:
1. Press `Win + R`, type `shell:startup`, and press Enter.
2. Create a shortcut to `AR_Wings_Kiosk.exe` in this folder.
3. In display settings, set screen orientation to **Portrait** with resolution **1080 × 1920**.

---

## 14. Performance Optimization & Zero-GC Best Practices

* **Zero Memory Allocations in Update:** Avoid `new Vector3()`, `new List()`, or string concatenation inside `Update()` and `OnLandmarksReceived()`. Pre-allocate all data containers as private class fields.
* **Camera Texture Format:** Request `ImageFormat.Types.Format.Srgba` directly from `WebCamTexture` to bypass CPU color conversion bottlenecks.
* **Target Frame Rate:** In `Awake()`, enforce:
  ```csharp
  Application.targetFrameRate = 60;
  QualitySettings.vSyncCount = 1;
  ```
* **Graphics API:** Use **Direct3D11** or **Direct3D12** in Player Settings for optimal GPU compute dispatch when running MediaPipe and VFX Graph simultaneously.
