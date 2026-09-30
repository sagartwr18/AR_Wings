# Open-Source Real-Time 3D Body Tracking: Comprehensive Analysis & Top Repositories

This document surveys the state-of-the-art open-source libraries, GitHub repositories, and frameworks capable of **live 3D body tracking via camera (monocular RGB webcam or multi-camera)**.

---

## 1. Quick Decision Matrix

| Project / Repository | Output Type | Best Hardware Target | Real-Time FPS | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Google MediaPipe Pose** | 33 3D Skeleton Landmarks | CPU / GPU / Mobile / Web | 30–60+ FPS | Lightweight, zero-latency, cross-platform apps |
| **OpenMMLab RTMW3D (MMPose)** | 133 3D Whole-body Keypoints | GPU / TensorRT / ONNX | 90–130+ FPS | High-speed multi-person & fine whole-body tracking |
| **ROMP / simple-romp** | 3D SMPL Body Mesh & Pose | Modern GPU (Nvidia) | 30–45 FPS | Live 3D surface mesh & body shape recovery |
| **Kalidokit** | Joint Rotations (Euler/Quat) & Blendshapes | Web / Node.js / Any CPU | 60+ FPS | Rigging 3D avatars (VRM/Unity/Web) from MediaPipe |
| **WHAM (CVPR 2024)** | World-grounded 3D Mesh | High-end GPU | ~15–30 FPS (Batch/Near RT) | Physically grounded 3D trajectory without foot slide |
| **4D-Humans (HMR 2.0)** | 3D SMPL Mesh + Tracking | High-end GPU | 20–30 FPS | High visual fidelity transformer-based mesh recovery |
| **EasyMocap** | 3D Keypoints & SMPL/SMPL-X Mesh | GPU (Linux/Win) | 15–30 FPS | Multi-camera & monocular markerless MoCap pipeline |
| **homuler/MediaPipeUnityPlugin** | 3D World Landmarks in Unity C# | Unity (PC / Mobile) | 30–60 FPS | Direct AR/VR integration inside Unity Engine |

---

## 2. Category 1: Lightweight, Real-Time Landmark Trackers (Webcam / CPU / Low-latency)

These solutions track skeletal joints as 3D vectors $(x, y, z)$. They are ideal for real-time interactive AR applications where you need to attach 3D objects (such as wings, virtual garments, or accessories) to spine/shoulder joints with minimal compute overhead.

---

### 1. Google MediaPipe Pose / BlazePose
* **GitHub Repository:** [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe)
* **License:** Apache 2.0
* **Platforms:** Python, C++, JavaScript (WebAssembly / WebGL), Android, iOS, Unity.

#### How It Works:
MediaPipe Pose uses a two-step detector-tracker architecture:
1. **Detector:** A detector model locates the person/region-of-interest (ROI) within the frame. Once detected, this step only runs occasionally if tracking is lost.
2. **Tracker (BlazePose):** Predicts **33 3D landmark points** directly from the cropped ROI.
3. **3D Output Formats:**
   - **Normalized Landmark Coordinates:** $(x, y)$ normalized to $[0.0, 1.0]$, with $z$ representing relative depth (smaller $z$ means closer to camera).
   - **World 3D Landmarks:** $(x, y, z)$ in real-world metric coordinates (meters), with the origin centered at the subject's hips.

#### Why It's One of the Best:
* Runs smoothly on ordinary consumer CPUs without an expensive dedicated GPU.
* Near-zero installation friction (`pip install mediapipe`).
* Provides dedicated landmarks for shoulders, spine, hips, wrists, knees, and ankles.

---

### 2. Kalidokit
* **GitHub Repository:** [yeemachine/kalidokit](https://github.com/yeemachine/kalidokit)
* **License:** MIT
* **Platforms:** JavaScript / TypeScript, Node.js, Web browsers.

#### How It Works:
* Raw landmark detectors (like MediaPipe) only output raw 3D point positions $(x, y, z)$, not the joint rotation angles (rotations / quaternions) required by 3D game engines (Unity, Three.js, Babylon.js).
* Kalidokit is an open-source kinematics and blendshape solver. It takes MediaPipe's raw 3D coordinates and converts them into **Euler angles, quaternions, and blendshapes** for human bones (spine, chest, upper arms, neck, etc.).

#### Why It's One of the Best:
* Bridges the gap between raw tracking coordinates and 3D rig animation.
* Solves joint twist, limb orientation, and rotation constraints mathematically in real-time.

---

### 3. MediaPipeUnityPlugin
* **GitHub Repository:** [homuler/MediaPipeUnityPlugin](https://github.com/homuler/MediaPipeUnityPlugin)
* **License:** MIT
* **Platforms:** Unity 2022.3+ (Windows, macOS, Linux, Android, iOS).

#### How It Works:
* Exposes the native MediaPipe C++ graph execution engine directly to Unity C# via native plugins.
* Captures the webcam feed via Unity's `WebCamTexture`, pushes image frames into the MediaPipe graph, and returns native C# structs containing 3D landmark data.

#### Why It's One of the Best:
* The leading open-source choice if your target application or AR experience runs in the **Unity Engine**.
* Allows attaching 3D game objects or particle systems directly to tracked skeletal joints in Unity 3D world space.

---

### 4. bodypose3d (Multi-Camera 3D Triangulation)
* **GitHub Repository:** [TemugeB/bodypose3d](https://github.com/TemugeB/bodypose3d)
* **License:** MIT
* **Platforms:** Python, OpenCV.

#### How It Works:
* Single-camera 3D tracking always suffers from depth ambiguity (depth is an estimate).
* `bodypose3d` uses two standard calibrated webcams (stereo setup), runs 2D pose detection (MediaPipe) on both views, and uses the **Direct Linear Transform (DLT)** triangulation algorithm to calculate true physical 3D coordinates in Euclidean space.

---

## 3. Category 2: High-Performance Whole-Body Deep Learning (Multi-Person & Ultra Fast)

---

### 5. OpenMMLab RTMW3D / RTMPose-3D (MMPose)
* **GitHub Repository:** [open-mmlab/mmpose](https://github.com/open-mmlab/mmpose) (under `projects/rtmw` & `projects/rtmpose`)
* **License:** Apache 2.0
* **Platforms:** Python, PyTorch, ONNXRuntime, TensorRT, C++ (MMDeploy).

#### How It Works:
* Developed by OpenMMLab, RTMPose replaces standard heatmap regression with **SimCC (Simple Coordinate Classification)**, dividing coordinate prediction into independent 1D horizontal and vertical classification bins with depth estimation.
* **RTMW3D (Real-Time Whole-Body 3D):** Predicts 133 3D keypoints simultaneously covering:
  - Body skeleton (17–26 points)
  - Hands / fingers (42 points)
  - Face mesh contours (68 points)
  - Feet keypoints (6 points)

#### Why It's One of the Best:
* Runs at **90 to 130+ FPS** on modern Nvidia GPUs (e.g., RTX 3060/4060) and 30+ FPS on CPU via ONNX / TensorRT.
* Handles complex poses, multiple people, occlusions, and fast athletic motions significantly better than standard lightweight detectors.

---

## 4. Category 3: 3D Human Mesh Recovery (Full 3D Body Surface / SMPL)

Unlike landmark models that only give point sticks, Human Mesh Recovery (HMR) models reconstruct a complete **3D human body mesh (SMPL / SMPL-X)** with surface geometry, body shape ($\beta$), and joint rotations ($\theta$).

---

### 6. ROMP / simple-romp
* **GitHub Repository:** [Arthur151/ROMP](https://github.com/Arthur151/ROMP)
* **License:** Apache 2.0 / Academic
* **Platforms:** Python (cross-platform: Linux, Windows, macOS).

#### How It Works:
* Traditional HMR requires a multi-stage pipeline: Detect person $\rightarrow$ Crop bounding box $\rightarrow$ Feed to neural network $\rightarrow$ Fit SMPL parameters.
* ROMP (Regression of Multiple 3D People) is a **one-stage** network. It simultaneously predicts 2D body center maps, 3D body mesh parameters (SMPL), and camera translation for all people in the frame in a single forward pass.
* Provides `simple-romp`, a pip-installable command-line interface that runs live on a webcam:
  ```bash
  pip install simple-romp
  romp --mode=webcam --show
  ```

#### Extensions by Same Author:
* **BEV (Bird's-Eye-View):** Solves relative depth reasoning when people stand behind one another.
* **TRACE:** Incorporates temporal tracking and trajectory estimation for dynamic moving cameras.

---

### 7. 4D-Humans (HMR 2.0)
* **GitHub Repository:** [shubham-goel/4D-Humans](https://github.com/shubham-goel/4D-Humans)
* **License:** MIT / Academic
* **Platforms:** Python, PyTorch, Detectron2.

#### How It Works:
* Uses a Vision Transformer (ViT) backbone trained on large-scale datasets (HMR 2.0).
* Integrates with PHALP (Predicting Humans Across Lifetimes with Appearance, Location, and Pose) to maintain consistent identity and 3D body orientation across long video sequences even through severe occlusions.

#### Why It's One of the Best:
* Offers superior surface fidelity, natural limb articulation, and realistic body shape deformation.

---

### 8. WHAM: World-grounded Humans with Accurate 3D Motion (CVPR 2024)
* **GitHub Repository:** [yohanshin/WHAM](https://github.com/yohanshin/WHAM)
* **License:** Academic / Custom Open-Source
* **Platforms:** Python, PyTorch.

#### How It Works:
* Most monocular 3D tracking methods estimate poses in **camera coordinates**, which causes floating and "foot-sliding" when the person walks or the camera moves.
* WHAM integrates video feature extraction (ViTPose), camera visual SLAM (DROID-SLAM / DPVO), and a contact-aware neural trajectory estimator to output motion grounded in true **world coordinates**.

---

## 5. Category 4: Markerless Motion Capture (MoCap) Toolboxes

---

### 9. EasyMocap
* **GitHub Repository:** [zju3dv/EasyMocap](https://github.com/zju3dv/EasyMocap)
* **License:** GNU GPL v3
* **Platforms:** Python, PyTorch (Linux, Windows).

#### How It Works:
* Built by the 3D Vision group at Zhejiang University.
* An open-source toolbox designed for markerless motion capture supporting:
  - Single monocular RGB camera
  - Multi-camera synchronized arrays (calibrated)
  - RGB-D cameras (Kinect / RealSense)
* Reconstructs 3D keypoints, 3D skeletons, and fits full SMPL/SMPL-X human body meshes.

---

## 6. How These Libraries Apply to Live AR Projects (e.g. Virtual Wings Attachment)

When building an AR application where virtual 3D elements (like wings) must follow the human body in real time via camera, the primary technical requirements are:

1. **Torso & Spine Vector Estimation:**
   - Virtual wings anchor between the left shoulder (`LEFT_SHOULDER`), right shoulder (`RIGHT_SHOULDER`), and upper spine/chest.
   - You need the normal vector of the chest plane:
     $$\vec{N} = (\vec{P}_{\text{right\_shoulder}} - \vec{P}_{\text{left\_shoulder}}) \times (\vec{P}_{\text{hip\_center}} - \vec{P}_{\text{shoulder\_center}})$$
   - The wings are positioned at the back by inverting or offsetting along the normal vector $\vec{N}$.

2. **Latency vs. Accuracy Trade-Off:**
   - **For interactive live webcam feeds (30–60 FPS, no GPU required):** **MediaPipe Pose** (or **MediaPipeUnityPlugin** if inside Unity) + **Kalidokit** is the most reliable, zero-lag solution.
   - **For high-end GPU workstations with full 3D body surface visualization:** **ROMP (`simple-romp`)** or **OpenMMLab RTMW3D**.
   - **For multi-camera studio precision:** **TemugeB/bodypose3d** or **EasyMocap**.
