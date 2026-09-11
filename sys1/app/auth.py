import time
import uuid
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db
from .config import DEMO_USERS, JWT_ALGORITHM, JWT_SECRET, TOKEN_EXPIRE_SECONDS

_bearer = HTTPBearer(auto_error=False)

# Hash demo passwords once at import time rather than storing plaintext.
_HASHED_USERS = {u: bcrypt.hashpw(p.encode(), bcrypt.gensalt()) for u, p in DEMO_USERS.items()}


def authenticate(username: str, password: str, device_id: Optional[str] = None):
    hashed = _HASHED_USERS.get(username)
    if not hashed or not bcrypt.checkpw(password.encode(), hashed):
        return None

    jti = str(uuid.uuid4())
    now = int(time.time())
    payload = {"sub": username, "jti": jti, "iat": now, "exp": now + TOKEN_EXPIRE_SECONDS}
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    db.create_session(jti, username, device_id)
    return token, TOKEN_EXPIRE_SECONDS


class CurrentSession:
    def __init__(self, username: str, jti: str, row):
        self.username = username
        self.jti = jti
        self.row = row


def get_current_session(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> CurrentSession:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")

    jti = payload["jti"]
    row = db.get_session(jti)
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown session")
    if row["killed"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "session has been killed by admin")

    return CurrentSession(username=payload["sub"], jti=jti, row=row)
