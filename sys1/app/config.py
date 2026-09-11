import os

JWT_SECRET = os.environ.get("SENTINEL_JWT_SECRET", "dev-secret-change-me-before-demo")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = int(os.environ.get("SENTINEL_TOKEN_EXPIRE_SECONDS", "3600"))

# How fast a token's geo/ip context is allowed to change before it's flagged
# as impossible travel (attack demo 2).
IMPOSSIBLE_TRAVEL_WINDOW_SECONDS = int(os.environ.get("SENTINEL_IMPOSSIBLE_TRAVEL_WINDOW", "60"))

DB_PATH = os.environ.get("SENTINEL_DB_PATH", "sentinel_zero.db")

# Demo-only credentials. Change before any real deployment.
DEMO_USERS = {
    "admin": os.environ.get("SENTINEL_ADMIN_PASSWORD", "admin123"),
}
