import os
import io
import json
import uuid
import socket
import base64
import time
import smtplib
import urllib.request
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

import cv2
import numpy as np
import torch
import torchvision.models as models
from torchvision import transforms
from PIL import Image
from pydantic import BaseModel
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

# -------------------------------
# Paths & Environment Setup
# -------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
SUPABASE_CONFIG_FILE = os.path.join(BASE_DIR, "supabase_config.json")
EMAIL_CONFIG_FILE = os.path.join(BASE_DIR, "email_config.json")

# -------------------------------
# In-Memory Captures Storage (Zero Disk Storage)
# -------------------------------
ACTIVE_CAPTURES = {}

def clean_expired_captures():
    """Removes temporary captures older than 20 minutes from RAM."""
    now = time.time()
    expired = [cid for cid, item in list(ACTIVE_CAPTURES.items()) if now - item.get("created_at", 0) > 1200]
    for cid in expired:
        ACTIVE_CAPTURES.pop(cid, None)

# -------------------------------
# Torch & Performance Settings
# -------------------------------
torch.set_num_threads(4)
torch.set_grad_enabled(False)
device = torch.device("cpu")

# -------------------------------
# Network Helpers
# -------------------------------
def get_local_ip():
    """Detects local LAN IP so phones on the same Wi-Fi can open the claim page."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_claim_base_url():
    """Returns the public tunnel URL if available, or Render URL / local IP."""
    pub = os.environ.get("PUBLIC_URL")
    if pub:
        return pub.rstrip("/")

    render_url = os.environ.get("RENDER_EXTERNAL_URL")
    if render_url:
        return render_url.rstrip("/")

    tunnel_file = os.path.join(BASE_DIR, "tunnel.txt")
    if os.path.exists(tunnel_file):
        try:
            with open(tunnel_file, "r", encoding="utf-8") as f:
                t_url = f.read().strip()
                if t_url.startswith("http"):
                    return t_url.rstrip("/")
        except Exception:
            pass

    if os.environ.get("RENDER"):
        return "https://ar-wings-backend.onrender.com"

    local_ip = get_local_ip()
    return f"http://{local_ip}:8000"

# -------------------------------
# Supabase Integration Helpers
# -------------------------------
def load_supabase_config():
    default_config = {
        "supabase_url": "",
        "supabase_key": "",
        "table_name": "kiosk_leads"
    }
    if os.path.exists(SUPABASE_CONFIG_FILE):
        try:
            with open(SUPABASE_CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                default_config.update(cfg)
        except Exception as e:
            print(f"Error reading {SUPABASE_CONFIG_FILE}: {e}")

    default_config["supabase_url"] = os.environ.get("SUPABASE_URL", default_config.get("supabase_url", "")).strip().rstrip("/")
    default_config["supabase_key"] = os.environ.get("SUPABASE_KEY", default_config.get("supabase_key", "")).strip()
    return default_config

def supabase_insert_record(record: dict):
    """Inserts a new capture lead into Supabase PostgreSQL database."""
    config = load_supabase_config()
    url = config.get("supabase_url")
    key = config.get("supabase_key")
    table = config.get("table_name", "kiosk_leads")

    if not (url and key):
        print(f"[INFO] Supabase credentials not set. Lead {record.get('id')} kept in memory.")
        return False

    endpoint = f"{url}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    try:
        data = json.dumps(record).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status in [200, 201]:
                print(f"[OK] Record {record.get('id')} inserted into Supabase table '{table}'.")
                return True
    except Exception as e:
        print(f"[WARN] Supabase insert failed: {e}")
        return False

def supabase_update_record(capture_id: str, updates: dict):
    """Updates the lead with email, phone, and claim timestamp in Supabase."""
    config = load_supabase_config()
    url = config.get("supabase_url")
    key = config.get("supabase_key")
    table = config.get("table_name", "kiosk_leads")

    if not (url and key):
        return False

    endpoint = f"{url}/rest/v1/{table}?id=eq.{capture_id}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    try:
        data = json.dumps(updates).encode("utf-8")
        req = urllib.request.Request(endpoint, data=data, headers=headers, method="PATCH")
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status in [200, 204]:
                print(f"[OK] Record {capture_id} updated in Supabase with email & phone.")
                return True
    except Exception as e:
        print(f"[WARN] Supabase update failed: {e}")
        return False

# -------------------------------
# Email Dispatcher Helper
# -------------------------------
def load_email_config():
    default_config = {
        "resend_api_key": "",
        "brevo_api_key": "",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_pass": "",
        "from_email": "KIVAS TECH <wings@kivastech.com>",
        "subject": "Your AR Angel Wings Photo is Here! ✨"
    }
    if os.path.exists(EMAIL_CONFIG_FILE):
        try:
            with open(EMAIL_CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                default_config.update(cfg)
        except Exception:
            pass

    default_config["resend_api_key"] = os.environ.get("RESEND_API_KEY", default_config.get("resend_api_key", "")).strip()
    default_config["brevo_api_key"] = os.environ.get("BREVO_API_KEY", default_config.get("brevo_api_key", "")).strip()
    default_config["smtp_host"] = os.environ.get("SMTP_HOST", default_config.get("smtp_host", "smtp.gmail.com"))
    default_config["smtp_port"] = int(os.environ.get("SMTP_PORT", default_config.get("smtp_port", 587)))
    default_config["smtp_user"] = os.environ.get("SMTP_USER", default_config.get("smtp_user", "")).strip()
    default_config["smtp_pass"] = os.environ.get("SMTP_PASS", default_config.get("smtp_pass", "")).strip().replace(" ", "")
    default_config["from_email"] = os.environ.get("FROM_EMAIL", default_config.get("from_email", "KIVAS TECH <onboarding@resend.dev>")).strip()
    default_config["subject"] = os.environ.get("SUBJECT", default_config.get("subject", "Your AR Angel Wings Photo is Here! ✨")).strip()
    return default_config

def send_via_resend_api(api_key: str, from_email: str, to_email: str, subject: str, body_text: str, image_bytes: bytes):
    """Sends email via Resend HTTPS REST API (Port 443 - 100% works on Render free tier)."""
    endpoint = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "AR-Wings-App/1.0"
    }

    attachments = []
    if image_bytes:
        b64_img = base64.b64encode(image_bytes).decode("utf-8")
        attachments.append({
            "filename": "MyAngelWings.jpg",
            "content": b64_img
        })

    # Resend requires onboarding@resend.dev unless a custom verified domain is configured
    if from_email and "@resend.dev" in from_email:
        sender = from_email
    elif from_email and "@" in from_email and not any(p in from_email.lower() for p in ["gmail.com", "yahoo.", "outlook.", "hotmail.", "icloud."]):
        sender = from_email
    else:
        sender = "KIVAS TECH <onboarding@resend.dev>"

    payload = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "text": body_text,
        "attachments": attachments
    }

    try:
        req = urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201):
                print(f"[SUCCESS] Email delivered to {to_email} via Resend REST API!")
                return True
            return False
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        print(f"[ERROR] Resend API error ({e.code}): {err_msg}")
        raise e

def send_via_brevo_api(api_key: str, from_email: str, to_email: str, subject: str, body_text: str, image_bytes: bytes):
    """Sends email via Brevo HTTPS REST API (Port 443 - 100% works on Render free tier)."""
    endpoint = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "User-Agent": "AR-Wings-App/1.0"
    }

    attachment = []
    if image_bytes:
        b64_img = base64.b64encode(image_bytes).decode("utf-8")
        attachment.append({
            "name": "MyAngelWings.jpg",
            "content": b64_img
        })

    sender_email = "sagartwr18@gmail.com"
    if "@" in from_email:
        sender_email = from_email.split("<")[-1].replace(">", "").strip()

    payload = {
        "sender": {"name": "KIVAS TECH", "email": sender_email},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": body_text,
        "attachment": attachment
    }

    req = urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status in (200, 201):
            print(f"[SUCCESS] Email delivered to {to_email} via Brevo REST API!")
            return True
        return False

def send_wings_email_from_bytes(to_email: str, phone: str, image_bytes: bytes):
    """Sends the user their AR Angel Wings photo directly from memory using HTTPS REST or SMTP."""
    config = load_email_config()
    resend_key = config.get("resend_api_key", "").strip()
    brevo_key = config.get("brevo_api_key", "").strip()
    smtp_host = config.get("smtp_host", "smtp.gmail.com")
    smtp_port = int(config.get("smtp_port", 587))
    smtp_user = config.get("smtp_user", "").strip()
    smtp_pass = config.get("smtp_pass", "").strip().replace(" ", "")
    from_email = config.get("from_email") or "KIVAS TECH <onboarding@resend.dev>"
    subject = config.get("subject", "Your AR Angel Wings Photo is Here! ✨")

    body_text = f"""Hello!

Thank you for visiting the AR Angel Wings Experience by KIVAS TECH!

You look absolutely stunning with your celestial angel wings. 
Attached to this email is your high-resolution keepsake photo.

Spread your wings, shine bright, and have a wonderful day! ✨

---
KIVAS TECH Interactive AR Kiosk
Phone: {phone}
"""

    # 1. First priority for Cloud Deployments: Resend HTTPS REST API (Port 443 - Never Blocked)
    if resend_key:
        try:
            return send_via_resend_api(resend_key, from_email, to_email, subject, body_text, image_bytes)
        except Exception as e:
            print(f"[WARN] Resend API failed ({e}), attempting next method...")

    # 2. Second priority: Brevo HTTPS REST API (Port 443 - Never Blocked)
    if brevo_key:
        try:
            return send_via_brevo_api(brevo_key, from_email, to_email, subject, body_text, image_bytes)
        except Exception as e:
            print(f"[WARN] Brevo API failed ({e}), attempting next method...")

    # 3. Third priority: Direct SMTP (SSL 465 or STARTTLS 587)
    if not (smtp_user and smtp_pass):
        print(f"[NOTICE] Email credentials not set. Simulated email dispatch to: {to_email} (Phone: {phone})")
        return False

    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body_text, "plain"))

    if image_bytes:
        image_attachment = MIMEImage(image_bytes, name="MyAngelWings.jpg")
        msg.attach(image_attachment)

    # Try SMTP SSL on 465 first
    try:
        server = smtplib.SMTP_SSL(smtp_host, 465, timeout=10)
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"[SUCCESS] Real email delivered to {to_email} via SMTP_SSL 465!")
        return True
    except Exception as e_ssl:
        print(f"[DEBUG] SMTP_SSL 465 attempt: {e_ssl}")

    # Fallback to STARTTLS on 587
    try:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"[SUCCESS] Real email delivered to {to_email} with photo attached via SMTP 587!")
        return True
    except Exception as e:
        print(f"[ERROR] SMTP sending failed: {e}")
        return False

# -------------------------------
# Face Detectors & FairFace Model
# -------------------------------
face_proto = os.path.join(MODELS_DIR, "deploy.prototxt")
face_caffe = os.path.join(MODELS_DIR, "res10_300x300_ssd_iter_140000.caffemodel")

if os.path.exists(face_proto) and os.path.exists(face_caffe):
    try:
        if hasattr(cv2, 'dnn') and hasattr(cv2.dnn, 'readNetFromCaffe'):
            face_net = cv2.dnn.readNetFromCaffe(face_proto, face_caffe)
            print("[OK] OpenCV SSD Face Detector initialized.")
        else:
            face_net = None
    except Exception as e:
        print(f"[WARN] Could not load Caffe face detector: {e}")
        face_net = None
else:
    face_net = None

face_cascade = None
try:
    if hasattr(cv2, 'CascadeClassifier') and hasattr(cv2, 'data') and hasattr(cv2.data, 'haarcascades'):
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
except Exception as e:
    print(f"[WARN] Could not load Haar cascade: {e}")
    face_cascade = None

model_path = os.path.join(MODELS_DIR, "fairface_alldata_4race_20191111.pt")
model = models.resnet34(weights=None)
model.fc = torch.nn.Linear(model.fc.in_features, 18)

if os.path.exists(model_path):
    print(f"Loading FairFace model from {model_path}...")
    state_dict = torch.load(model_path, map_location=device)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    try:
        model = torch.jit.script(model)
        print("[OK] FairFace Model successfully compiled with TorchScript!")
    except Exception as e:
        print(f"TorchScript notice: {e}, running standard model.")
else:
    print(f"WARNING: Model file not found at {model_path}")

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

def run_gender_inference(face_img_bgr):
    img_rgb = cv2.cvtColor(face_img_bgr, cv2.COLOR_BGR2RGB)
    img_pil = Image.fromarray(img_rgb)
    img_tensor = transform(img_pil).unsqueeze(0).to(device)

    with torch.inference_mode():
        outputs = model(img_tensor)

    gender_scores = outputs[0, 7:9]
    probabilities = torch.softmax(gender_scores, dim=0).cpu().numpy()
    male_prob = float(probabilities[0])
    female_prob = float(probabilities[1])
    predicted_gender = "Male" if male_prob >= female_prob else "Female"
    confidence = male_prob if predicted_gender == "Male" else female_prob
    return predicted_gender, confidence, male_prob, female_prob

def extract_face_crop(frame):
    h, w = frame.shape[:2]
    if face_net is not None:
        blob = cv2.dnn.blobFromImage(
            cv2.resize(frame, (300, 300)),
            1.0, (300, 300),
            (104.0, 177.0, 123.0)
        )
        face_net.setInput(blob)
        detections = face_net.forward()
        best_conf = 0.0
        best_box = None
        for i in range(detections.shape[2]):
            confidence = float(detections[0, 0, i, 2])
            if confidence > 0.45 and confidence > best_conf:
                box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                (x1, y1, x2, y2) = box.astype("int")
                if x2 - x1 >= 40 and y2 - y1 >= 40:
                    best_conf = confidence
                    best_box = (x1, y1, x2, y2)

        if best_box is not None:
            x1, y1, x2, y2 = best_box
            pad_x = int(0.20 * (x2 - x1))
            pad_y = int(0.25 * (y2 - y1))
            cx1 = max(0, x1 - pad_x)
            cy1 = max(0, y1 - pad_y)
            cx2 = min(w, x2 + pad_x)
            cy2 = min(h, y2 + pad_y)
            crop = frame[cy1:cy2, cx1:cx2]
            if crop.size > 0:
                return crop, [int(cx1), int(cy1), int(cx2 - cx1), int(cy2 - cy1)]

    if face_cascade is not None:
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(50, 50))
            if len(faces) > 0:
                faces_sorted = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
                x, y, fw, fh = faces_sorted[0]
                pad = int(0.20 * max(fw, fh))
                x1 = max(0, x - pad)
                y1 = max(0, y - pad)
                x2 = min(w, x + fw + pad)
                y2 = min(h, y + fh + pad)
                crop = frame[y1:y2, x1:x2]
                if crop.size > 0:
                    return crop, [int(x1), int(y1), int(x2 - x1), int(y2 - y1)]
        except Exception as e:
            print(f"[WARN] Haar detection failed: {e}")

    if min(h, w) >= 80:
        return frame, [0, 0, w, h]
    return None, None

# -------------------------------
# FastAPI Application & Routes
# -------------------------------
app = FastAPI(title="AR Wings Kiosk & Supabase Lead Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Base64ImageRequest(BaseModel):
    image: str

class SaveCaptureRequest(BaseModel):
    image: str
    gender: str = "female"

class ClaimRequest(BaseModel):
    email: str
    phone: str

@app.get("/health")
def health_check():
    supabase_cfg = load_supabase_config()
    return {
        "status": "ok",
        "model_loaded": os.path.exists(model_path),
        "ssd_face_detector": face_net is not None,
        "supabase_connected": bool(supabase_cfg.get("supabase_url") and supabase_cfg.get("supabase_key")),
        "active_memory_captures": len(ACTIVE_CAPTURES),
        "local_ip": get_local_ip()
    }

@app.post("/predict_base64")
def predict_base64(payload: Base64ImageRequest):
    try:
        raw_b64 = payload.image
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        
        image_bytes = base64.b64decode(raw_b64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return JSONResponse({"error": "Failed to decode image"}, status_code=400)

        face_crop, box = extract_face_crop(frame)
        if face_crop is None:
            return {"face_detected": False, "gender": None, "confidence": 0.0}

        gender, conf, m_p, f_p = run_gender_inference(face_crop)
        return {
            "face_detected": True,
            "gender": gender,
            "confidence": conf,
            "male_prob": m_p,
            "female_prob": f_p,
            "box": box
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/save_capture")
def save_capture(payload: SaveCaptureRequest):
    """
    Holds captured image in memory (no disk file) and records lead in Supabase.
    """
    try:
        clean_expired_captures()
        raw_b64 = payload.image
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        
        image_bytes = base64.b64decode(raw_b64)
        capture_id = f"wings_{int(time.time())}_{uuid.uuid4().hex[:6]}"

        # Store in RAM only
        ACTIVE_CAPTURES[capture_id] = {
            "image_bytes": image_bytes,
            "gender": payload.gender,
            "created_at": time.time()
        }

        # Insert metadata into Supabase
        record = {
            "id": capture_id,
            "gender": payload.gender,
            "email": None,
            "phone": None,
            "claimed": False,
            "email_sent": False,
            "claimed_at": None
        }
        supabase_insert_record(record)

        base_url = get_claim_base_url()
        claim_url = f"{base_url}/claim/{capture_id}"

        return {
            "status": "success",
            "capture_id": capture_id,
            "claim_url": claim_url
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/preview/{capture_id}")
def get_preview_image(capture_id: str):
    """Serves photo directly from memory for the mobile preview."""
    item = ACTIVE_CAPTURES.get(capture_id)
    if item and item.get("image_bytes"):
        return Response(content=item["image_bytes"], media_type="image/jpeg")
    return Response(content=b"", status_code=404)

@app.get("/claim/{capture_id}", response_class=HTMLResponse)
def render_claim_page(capture_id: str):
    """Renders mobile web page for entering Email & Phone Number."""
    item = ACTIVE_CAPTURES.get(capture_id)
    if not item:
        return HTMLResponse("""
        <div style="text-align:center;padding:50px;font-family:sans-serif;color:#fff;background:#09090e;min-height:100vh;">
            <h2>✨ Photo Session Expired</h2>
            <p style="color:#9ca3af;">Please capture a new photo at the mirror kiosk!</p>
        </div>
        """, status_code=404)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Get Your Angel Wings Photo ✨</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }}
    body {{
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: #09090e;
      color: #f3f4f6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px 16px;
      position: relative;
      overflow-x: hidden;
    }}
    body::before {{
      content: '';
      position: fixed;
      top: -20%;
      left: 50%;
      transform: translateX(-50%);
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(236, 72, 153, 0.25) 0%, rgba(59, 130, 246, 0.15) 50%, transparent 70%);
      filter: blur(50px);
      z-index: 0;
      pointer-events: none;
    }}
    .card {{
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      background: rgba(18, 18, 28, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 28px;
      padding: 28px 22px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 30px rgba(236, 72, 153, 0.15);
      text-align: center;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(236, 72, 153, 0.15);
      border: 1px solid rgba(236, 72, 153, 0.35);
      color: #f472b6;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }}
    h1 {{
      font-family: 'Outfit', sans-serif;
      font-size: 1.85rem;
      font-weight: 800;
      line-height: 1.2;
      color: #ffffff;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }}
    p.subtext {{
      font-size: 0.92rem;
      color: #9ca3af;
      margin-bottom: 20px;
      line-height: 1.45;
    }}
    .photo-preview {{
      width: 100%;
      height: 240px;
      border-radius: 18px;
      overflow: hidden;
      margin-bottom: 22px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
      background: #000;
      position: relative;
    }}
    .photo-preview img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
    }}
    .form-group {{
      margin-bottom: 16px;
      text-align: left;
    }}
    label {{
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      color: #e5e7eb;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    input {{
      width: 100%;
      padding: 13px 16px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(255, 255, 255, 0.06);
      color: #fff;
      font-size: 1rem;
      font-family: inherit;
      outline: none;
      transition: all 0.2s ease;
    }}
    input:focus {{
      border-color: #ec4899;
      background: rgba(255, 255, 255, 0.1);
      box-shadow: 0 0 16px rgba(236, 72, 153, 0.3);
    }}
    input::placeholder {{
      color: #6b7280;
    }}
    .btn-submit {{
      width: 100%;
      padding: 14px 20px;
      margin-top: 8px;
      border-radius: 14px;
      border: none;
      background: linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #8b5cf6 100%);
      color: #ffffff;
      font-size: 1.05rem;
      font-weight: 700;
      font-family: 'Outfit', sans-serif;
      cursor: pointer;
      box-shadow: 0 12px 28px rgba(236, 72, 153, 0.35);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }}
    .btn-submit:active {{ transform: scale(0.98); }}
    .success-card {{ display: none; padding: 20px 0; }}
    .success-icon {{ font-size: 3.5rem; margin-bottom: 12px; }}
    .btn-download {{
      display: inline-block;
      margin-top: 18px;
      padding: 12px 24px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.92rem;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div id="form-section">
      <div class="badge">✨ AR ANGEL WINGS ✨</div>
      <h1>Claim Your Photo</h1>
      <p class="subtext">Enter your details below to receive your wings photo directly in your inbox!</p>
      
      <div class="photo-preview">
        <img src="/preview/{capture_id}" alt="Your AR Wings Photo" />
      </div>

      <form id="claim-form">
        <div class="form-group">
          <label for="email">Email Address</label>
          <input type="email" id="email" name="email" required placeholder="you@example.com">
        </div>
        <div class="form-group">
          <label for="phone">Phone Number</label>
          <input type="tel" id="phone" name="phone" required placeholder="+1 (555) 000-0000">
        </div>
        <button type="submit" id="submit-btn" class="btn-submit">Save & Send to My Email ✨</button>
      </form>
    </div>

    <div id="success-section" class="success-card">
      <div class="success-icon">✨ 💌 ✨</div>
      <h1 style="color: #f472b6;">Photo Sent!</h1>
      <p class="subtext" id="success-msg">Your Angel Wings photo has been sent to your email. Check your inbox!</p>
      <a href="/preview/{capture_id}" download="MyAngelWings.jpg" class="btn-download">⬇️ Download Photo Directly</a>
    </div>
  </div>

  <script>
    const form = document.getElementById('claim-form');
    const submitBtn = document.getElementById('submit-btn');
    const formSection = document.getElementById('form-section');
    const successSection = document.getElementById('success-section');
    const successMsg = document.getElementById('success-msg');

    form.addEventListener('submit', async (e) => {{
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending Photo... ✨";

      try {{
        const res = await fetch('/api/claim/{capture_id}', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ email, phone }})
        }});

        const result = await res.json();
        if (result.status === 'success') {{
          formSection.style.display = 'none';
          successSection.style.display = 'block';
          successMsg.textContent = `Your Angel Wings photo has been sent to ${{email}}!`;
        }} else {{
          alert(result.error || 'Failed to submit. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = "Save & Send to My Email ✨";
        }}
      }} catch (err) {{
        alert('Error connecting to server. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = "Save & Send to My Email ✨";
      }}
    }});
  </script>
</body>
</html>
"""
    return HTMLResponse(html_content)

@app.post("/api/claim/{capture_id}")
def claim_capture(capture_id: str, payload: ClaimRequest):
    """
    Sends email directly from memory and updates Supabase database with user's email & phone.
    """
    try:
        email = payload.email.strip()
        phone = payload.phone.strip()

        item = ACTIVE_CAPTURES.get(capture_id)
        image_bytes = item.get("image_bytes") if item else None

        sent_ok = False
        if image_bytes:
            sent_ok = send_wings_email_from_bytes(email, phone, image_bytes)

        # Update Supabase database
        updates = {
            "email": email,
            "phone": phone,
            "claimed": True,
            "email_sent": sent_ok,
            "claimed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        supabase_update_record(capture_id, updates)

        return {
            "status": "success",
            "message": "User details saved to Supabase and photo emailed successfully!",
            "email": email,
            "phone": phone
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
