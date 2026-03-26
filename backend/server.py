from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import secrets
import base64
import io
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import pyotp
import qrcode

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24
OTP_EXPIRY_MINUTES = 10
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Pydantic Models ---
class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str
    device_fingerprint: str = ""
    user_agent: str = ""

class OTPVerifyRequest(BaseModel):
    email: str
    otp_code: str
    device_fingerprint: str = ""

class TOTPSetupRequest(BaseModel):
    token: str

class TOTPVerifyRequest(BaseModel):
    email: str
    totp_code: str
    token: str = ""

class PINSetupRequest(BaseModel):
    pin: str

class PINVerifyRequest(BaseModel):
    email: str
    pin: str
    token: str = ""

class TrustDeviceRequest(BaseModel):
    device_fingerprint: str
    device_name: str = "Unknown Device"

class LockConfigUpdate(BaseModel):
    otp_enabled: bool = True
    totp_enabled: bool = False
    pin_enabled: bool = False
    device_lock_enabled: bool = True

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

# --- Utility Functions ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(data: dict, expires_hours: int = JWT_EXPIRY_HOURS) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_partial_token(data: dict) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "partial": True}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def generate_otp() -> str:
    return f"{secrets.randbelow(1000000):06d}"

def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth.split(" ")[1]
    payload = decode_token(token)
    if payload.get("partial"):
        raise HTTPException(status_code=401, detail="Authentication incomplete")
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def log_security_event(user_id: str, event_type: str, details: str, severity: str = "info", ip: str = "", device: str = ""):
    event = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "event_type": event_type,
        "details": details,
        "severity": severity,
        "ip_address": ip,
        "device_info": device,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.security_logs.insert_one(event)

# --- Auth Endpoints ---
@api_router.post("/auth/register")
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": req.email.lower(),
        "password_hash": hash_password(req.password),
        "display_name": req.display_name or req.email.split("@")[0],
        "totp_secret": None,
        "pin_hash": None,
        "lock_config": {
            "otp_enabled": True,
            "totp_enabled": False,
            "pin_enabled": False,
            "device_lock_enabled": True
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    await log_security_event(user_id, "account_created", "New account registered", "info")
    
    return {"message": "Account created successfully", "user_id": user_id}

@api_router.post("/auth/login")
async def login(req: LoginRequest, request: Request):
    email = req.email.lower()
    ip = request.client.host if request.client else "unknown"
    
    # Check brute force lockout
    recent_attempts = await db.login_attempts.count_documents({
        "email": email,
        "success": False,
        "timestamp": {"$gte": (datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_MINUTES)).isoformat()}
    })
    
    if recent_attempts >= MAX_LOGIN_ATTEMPTS:
        await log_security_event("", "brute_force_blocked", f"Lockout for {email}", "critical", ip)
        raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {LOCKOUT_MINUTES} minutes.")
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(req.password, user["password_hash"]):
        await db.login_attempts.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "success": False,
            "ip_address": ip,
            "device_fingerprint": req.device_fingerprint,
            "user_agent": req.user_agent,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        if user:
            await log_security_event(user["id"], "login_failed", "Invalid credentials", "warning", ip, req.user_agent)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Log successful password verification
    await db.login_attempts.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "success": True,
        "ip_address": ip,
        "device_fingerprint": req.device_fingerprint,
        "user_agent": req.user_agent,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    lock_config = user.get("lock_config", {})
    mfa_steps = []
    
    # Check device trust
    if lock_config.get("device_lock_enabled") and req.device_fingerprint:
        trusted = await db.trusted_devices.find_one({
            "user_id": user["id"],
            "device_fingerprint": req.device_fingerprint,
            "active": True
        }, {"_id": 0})
        if not trusted:
            mfa_steps.append("device_verification")
    
    if lock_config.get("otp_enabled"):
        otp_code = generate_otp()
        await db.otps.insert_one({
            "user_id": user["id"],
            "email": email,
            "code": otp_code,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
        })
        mfa_steps.append("otp")
        logger.info(f"OTP for {email}: {otp_code}")
        await log_security_event(user["id"], "otp_sent", f"OTP sent to {email}", "info", ip)
    
    if lock_config.get("totp_enabled") and user.get("totp_secret"):
        mfa_steps.append("totp")
    
    if lock_config.get("pin_enabled") and user.get("pin_hash"):
        mfa_steps.append("pin")
    
    if not mfa_steps:
        # No MFA, issue full token
        token = create_token({"user_id": user["id"], "email": email})
        session_id = str(uuid.uuid4())
        await db.sessions.insert_one({
            "id": session_id,
            "user_id": user["id"],
            "token": token,
            "ip_address": ip,
            "device_fingerprint": req.device_fingerprint,
            "user_agent": req.user_agent,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_active": datetime.now(timezone.utc).isoformat(),
            "active": True
        })
        await log_security_event(user["id"], "login_success", "Login without MFA", "info", ip, req.user_agent)
        return {
            "status": "authenticated",
            "token": token,
            "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"]},
            "mfa_required": False
        }
    
    # Issue partial token for MFA flow
    partial_token = create_partial_token({"user_id": user["id"], "email": email})
    return {
        "status": "mfa_required",
        "partial_token": partial_token,
        "mfa_steps": mfa_steps,
        "mfa_required": True,
        "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"]}
    }

@api_router.post("/auth/verify-otp")
async def verify_otp(req: OTPVerifyRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    email = req.email.lower()
    
    otp_doc = await db.otps.find_one({
        "email": email,
        "code": req.otp_code,
        "used": False
    }, {"_id": 0})
    
    if not otp_doc:
        await log_security_event("", "otp_failed", f"Invalid OTP for {email}", "warning", ip)
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")
    
    if datetime.fromisoformat(otp_doc["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="OTP has expired")
    
    await db.otps.update_one({"email": email, "code": req.otp_code}, {"$set": {"used": True}})
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    lock_config = user.get("lock_config", {})
    remaining_steps = []
    
    if lock_config.get("totp_enabled") and user.get("totp_secret"):
        remaining_steps.append("totp")
    if lock_config.get("pin_enabled") and user.get("pin_hash"):
        remaining_steps.append("pin")
    
    await log_security_event(user["id"], "otp_verified", "OTP verification successful", "info", ip)
    
    if remaining_steps:
        partial_token = create_partial_token({"user_id": user["id"], "email": email, "otp_verified": True})
        return {"status": "mfa_continue", "partial_token": partial_token, "remaining_steps": remaining_steps}
    
    # All MFA complete
    token = create_token({"user_id": user["id"], "email": email})
    session_id = str(uuid.uuid4())
    await db.sessions.insert_one({
        "id": session_id,
        "user_id": user["id"],
        "token": token,
        "ip_address": ip,
        "device_fingerprint": req.device_fingerprint,
        "user_agent": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_active": datetime.now(timezone.utc).isoformat(),
        "active": True
    })
    await log_security_event(user["id"], "login_success", "Login with OTP", "info", ip)
    
    return {
        "status": "authenticated",
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"]}
    }

@api_router.post("/auth/verify-totp")
async def verify_totp(req: TOTPVerifyRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    email = req.email.lower()
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("totp_secret"):
        raise HTTPException(status_code=400, detail="TOTP not configured")
    
    totp = pyotp.TOTP(user["totp_secret"])
    if not totp.verify(req.totp_code, valid_window=1):
        await log_security_event(user["id"], "totp_failed", "Invalid TOTP code", "warning", ip)
        raise HTTPException(status_code=401, detail="Invalid TOTP code")
    
    lock_config = user.get("lock_config", {})
    remaining_steps = []
    if lock_config.get("pin_enabled") and user.get("pin_hash"):
        remaining_steps.append("pin")
    
    await log_security_event(user["id"], "totp_verified", "TOTP verification successful", "info", ip)
    
    if remaining_steps:
        partial_token = create_partial_token({"user_id": user["id"], "email": email, "totp_verified": True})
        return {"status": "mfa_continue", "partial_token": partial_token, "remaining_steps": remaining_steps}
    
    token = create_token({"user_id": user["id"], "email": email})
    await db.sessions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "token": token,
        "ip_address": ip,
        "device_fingerprint": "",
        "user_agent": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_active": datetime.now(timezone.utc).isoformat(),
        "active": True
    })
    
    return {
        "status": "authenticated",
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"]}
    }

@api_router.post("/auth/verify-pin")
async def verify_pin(req: PINVerifyRequest, request: Request):
    ip = request.client.host if request.client else "unknown"
    email = req.email.lower()
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("pin_hash"):
        raise HTTPException(status_code=400, detail="PIN not configured")
    
    if hash_pin(req.pin) != user["pin_hash"]:
        await log_security_event(user["id"], "pin_failed", "Invalid PIN", "warning", ip)
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    await log_security_event(user["id"], "pin_verified", "PIN verification successful", "info", ip)
    
    token = create_token({"user_id": user["id"], "email": email})
    await db.sessions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "token": token,
        "ip_address": ip,
        "device_fingerprint": "",
        "user_agent": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_active": datetime.now(timezone.utc).isoformat(),
        "active": True
    })
    
    return {
        "status": "authenticated",
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "display_name": user["display_name"]}
    }

@api_router.post("/auth/setup-totp")
async def setup_totp(request: Request):
    user = await get_current_user(request)
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user["email"], issuer_name="LockBox Secure Login")
    
    # Generate QR code as base64
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Save secret temporarily (user must verify before it's active)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"totp_secret_pending": secret, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    await log_security_event(user["id"], "totp_setup_initiated", "TOTP setup started", "info")
    
    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "provisioning_uri": provisioning_uri
    }

@api_router.post("/auth/confirm-totp")
async def confirm_totp(request: Request, body: dict):
    user = await get_current_user(request)
    code = body.get("code", "")
    
    pending_secret = user.get("totp_secret_pending")
    if not pending_secret:
        raise HTTPException(status_code=400, detail="No TOTP setup in progress")
    
    totp = pyotp.TOTP(pending_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid TOTP code")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "totp_secret": pending_secret,
            "totp_secret_pending": None,
            "lock_config.totp_enabled": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await log_security_event(user["id"], "totp_setup_complete", "TOTP authenticator configured", "info")
    return {"message": "TOTP authenticator configured successfully"}

@api_router.post("/auth/setup-pin")
async def setup_pin(request: Request, req: PINSetupRequest):
    user = await get_current_user(request)
    
    if len(req.pin) < 4 or len(req.pin) > 8:
        raise HTTPException(status_code=400, detail="PIN must be 4-8 digits")
    if not req.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must contain only digits")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "pin_hash": hash_pin(req.pin),
            "lock_config.pin_enabled": True,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await log_security_event(user["id"], "pin_setup", "Security PIN configured", "info")
    return {"message": "Security PIN configured successfully"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "lock_config": user.get("lock_config", {}),
        "has_totp": bool(user.get("totp_secret")),
        "has_pin": bool(user.get("pin_hash")),
        "created_at": user.get("created_at")
    }

@api_router.post("/auth/logout")
async def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ")[1]
        try:
            payload = decode_token(token)
            await db.sessions.update_many(
                {"user_id": payload["user_id"], "token": token},
                {"$set": {"active": False}}
            )
            await log_security_event(payload["user_id"], "logout", "User logged out", "info")
        except Exception:
            pass
    return {"message": "Logged out"}

@api_router.post("/auth/resend-otp")
async def resend_otp(body: dict, request: Request):
    email = body.get("email", "").lower()
    ip = request.client.host if request.client else "unknown"
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    otp_code = generate_otp()
    await db.otps.insert_one({
        "user_id": user["id"],
        "email": email,
        "code": otp_code,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)).isoformat()
    })
    logger.info(f"OTP for {email}: {otp_code}")
    await log_security_event(user["id"], "otp_resent", f"OTP resent to {email}", "info", ip)
    
    return {"message": "OTP sent successfully"}

# --- Device Endpoints ---
@api_router.get("/devices")
async def list_devices(request: Request):
    user = await get_current_user(request)
    devices = await db.trusted_devices.find(
        {"user_id": user["id"], "active": True}, {"_id": 0}
    ).to_list(100)
    return {"devices": devices}

@api_router.post("/devices/trust")
async def trust_device(req: TrustDeviceRequest, request: Request):
    user = await get_current_user(request)
    
    existing = await db.trusted_devices.find_one({
        "user_id": user["id"],
        "device_fingerprint": req.device_fingerprint
    }, {"_id": 0})
    
    if existing:
        await db.trusted_devices.update_one(
            {"user_id": user["id"], "device_fingerprint": req.device_fingerprint},
            {"$set": {"active": True, "last_used": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        await db.trusted_devices.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "device_fingerprint": req.device_fingerprint,
            "device_name": req.device_name,
            "active": True,
            "trusted_at": datetime.now(timezone.utc).isoformat(),
            "last_used": datetime.now(timezone.utc).isoformat()
        })
    
    await log_security_event(user["id"], "device_trusted", f"Device trusted: {req.device_name}", "info")
    return {"message": "Device trusted successfully"}

@api_router.delete("/devices/{device_id}")
async def remove_device(device_id: str, request: Request):
    user = await get_current_user(request)
    await db.trusted_devices.update_one(
        {"id": device_id, "user_id": user["id"]},
        {"$set": {"active": False}}
    )
    await log_security_event(user["id"], "device_removed", f"Device removed: {device_id}", "info")
    return {"message": "Device removed"}

# --- Security Dashboard Endpoints ---
@api_router.get("/security/logs")
async def get_security_logs(request: Request, limit: int = 50):
    user = await get_current_user(request)
    logs = await db.security_logs.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return {"logs": logs}

@api_router.get("/security/sessions")
async def get_sessions(request: Request):
    user = await get_current_user(request)
    sessions = await db.sessions.find(
        {"user_id": user["id"], "active": True}, {"_id": 0, "token": 0}
    ).sort("created_at", -1).to_list(50)
    return {"sessions": sessions}

@api_router.delete("/security/sessions/{session_id}")
async def revoke_session(session_id: str, request: Request):
    user = await get_current_user(request)
    await db.sessions.update_one(
        {"id": session_id, "user_id": user["id"]},
        {"$set": {"active": False}}
    )
    await log_security_event(user["id"], "session_revoked", f"Session revoked: {session_id}", "info")
    return {"message": "Session revoked"}

@api_router.get("/security/analytics")
async def get_analytics(request: Request):
    user = await get_current_user(request)
    
    # Get login attempts for the last 30 days
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    attempts = await db.login_attempts.find(
        {"email": user["email"], "timestamp": {"$gte": thirty_days_ago}}, {"_id": 0}
    ).to_list(1000)
    
    total = len(attempts)
    successful = sum(1 for a in attempts if a.get("success"))
    failed = total - successful
    
    # Group by day
    daily = {}
    for a in attempts:
        day = a["timestamp"][:10]
        if day not in daily:
            daily[day] = {"date": day, "success": 0, "failed": 0}
        if a.get("success"):
            daily[day]["success"] += 1
        else:
            daily[day]["failed"] += 1
    
    # Unique IPs and devices
    unique_ips = len(set(a.get("ip_address", "") for a in attempts))
    unique_devices = len(set(a.get("device_fingerprint", "") for a in attempts if a.get("device_fingerprint")))
    
    return {
        "total_attempts": total,
        "successful": successful,
        "failed": failed,
        "unique_ips": unique_ips,
        "unique_devices": unique_devices,
        "daily_stats": sorted(daily.values(), key=lambda x: x["date"]),
        "recent_attempts": attempts[-10:] if attempts else []
    }

@api_router.get("/security/threats")
async def get_threats(request: Request):
    user = await get_current_user(request)
    
    # Get critical/warning events
    threats = await db.security_logs.find(
        {"user_id": user["id"], "severity": {"$in": ["warning", "critical"]}}, {"_id": 0}
    ).sort("timestamp", -1).to_list(50)
    
    # Calculate threat score
    recent_threats = [t for t in threats if t["timestamp"] >= (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()]
    threat_score = min(100, max(0, 100 - len(recent_threats) * 10))
    
    return {
        "threat_score": threat_score,
        "threats": threats,
        "recent_count": len(recent_threats)
    }

# --- Settings Endpoints ---
@api_router.put("/settings/lock-config")
async def update_lock_config(req: LockConfigUpdate, request: Request):
    user = await get_current_user(request)
    
    update_data = {
        "lock_config.otp_enabled": req.otp_enabled,
        "lock_config.device_lock_enabled": req.device_lock_enabled,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Only allow enabling TOTP/PIN if they're configured
    if req.totp_enabled and not user.get("totp_secret"):
        raise HTTPException(status_code=400, detail="Setup TOTP first")
    if req.pin_enabled and not user.get("pin_hash"):
        raise HTTPException(status_code=400, detail="Setup PIN first")
    
    update_data["lock_config.totp_enabled"] = req.totp_enabled
    update_data["lock_config.pin_enabled"] = req.pin_enabled
    
    await db.users.update_one({"id": user["id"]}, {"$set": update_data})
    await log_security_event(user["id"], "lock_config_updated", "Lock configuration updated", "info")
    
    return {"message": "Lock configuration updated"}

@api_router.get("/settings/lock-config")
async def get_lock_config(request: Request):
    user = await get_current_user(request)
    return {
        "lock_config": user.get("lock_config", {}),
        "has_totp": bool(user.get("totp_secret")),
        "has_pin": bool(user.get("pin_hash"))
    }

@api_router.put("/settings/password")
async def change_password(req: PasswordChangeRequest, request: Request):
    user = await get_current_user(request)
    
    if not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(req.new_password),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    await log_security_event(user["id"], "password_changed", "Password changed", "info")
    return {"message": "Password changed successfully"}

# --- Health Check ---
@api_router.get("/")
async def root():
    return {"message": "LockBox Secure Login API", "status": "operational"}

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
