import os
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAPTURES_DIR = os.path.join(BASE_DIR, "captures")
DATABASE_FILE = os.path.join(BASE_DIR, "database.json")
CONFIG_FILE = os.path.join(BASE_DIR, "email_config.json")

def load_email_config():
    default_config = {
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_pass": "",
        "from_email": "KIVAS TECH <wings@kivastech.com>",
        "subject": "Your AR Angel Wings Photo is Here! ✨"
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                default_config.update(cfg)
        except Exception as e:
            print(f"Error reading {CONFIG_FILE}: {e}")

    default_config["smtp_host"] = os.environ.get("SMTP_HOST", default_config.get("smtp_host", "smtp.gmail.com"))
    default_config["smtp_port"] = int(os.environ.get("SMTP_PORT", default_config.get("smtp_port", 587)))
    default_config["smtp_user"] = os.environ.get("SMTP_USER", default_config.get("smtp_user", "")).strip()
    default_config["smtp_pass"] = os.environ.get("SMTP_PASS", default_config.get("smtp_pass", "")).strip().replace(" ", "")
    return default_config

def send_email(to_email: str, phone: str, image_path: str):
    config = load_email_config()
    smtp_host = config.get("smtp_host", "smtp.gmail.com")
    smtp_port = int(config.get("smtp_port", 587))
    smtp_user = config.get("smtp_user", "").strip()
    smtp_pass = config.get("smtp_pass", "").strip().replace(" ", "")
    from_email = config.get("from_email") or smtp_user or "wings@kivastech.com"
    subject = config.get("subject", "Your AR Angel Wings Photo is Here! ✨")

    if not (smtp_user and smtp_pass):
        print(f"[WARN] SMTP credentials missing in backend/email_config.json!")
        print(f"       Cannot send email to: {to_email}")
        return False

    body_text = f"""Hello!

Thank you for visiting the AR Angel Wings Experience by KIVAS TECH!

You look absolutely stunning with your celestial angel wings. 
Attached to this email is your high-resolution keepsake photo.

Spread your wings, shine bright, and have a wonderful day! ✨

---
KIVAS TECH Interactive AR Kiosk
Phone: {phone}
"""

    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body_text, "plain"))

    if os.path.exists(image_path):
        with open(image_path, "rb") as f:
            img_data = f.read()
        image_attachment = MIMEImage(img_data, name="MyAngelWings.jpg")
        msg.attach(image_attachment)
    else:
        print(f"[WARN] Image file not found at: {image_path}")

    try:
        print(f"Connecting to {smtp_host}:{smtp_port} as {smtp_user}...")
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"[SUCCESS] Email delivered to {to_email}!")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to send to {to_email}: {e}")
        return False

def resend_all():
    if not os.path.exists(DATABASE_FILE):
        print(f"[ERROR] Database file not found: {DATABASE_FILE}")
        return

    with open(DATABASE_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"Found {len(data)} total records in database.json\n")
    sent_count = 0

    for item in data:
        email = item.get("email")
        phone = item.get("phone", "")
        img_filename = item.get("image_filename")
        
        if email and img_filename:
            filepath = os.path.join(CAPTURES_DIR, img_filename)
            print(f"-> Processing: {email} (Image: {img_filename})")
            ok = send_email(email, phone, filepath)
            if ok:
                item["email_sent"] = True
                sent_count += 1

    with open(DATABASE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"\nFinished. Successfully sent {sent_count} emails.")

if __name__ == "__main__":
    resend_all()
