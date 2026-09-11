import os

JWT_SECRET = os.environ.get("SENTINEL_JWT_SECRET", "dev-secret-change-me-before-demo")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = int(os.environ.get("SENTINEL_TOKEN_EXPIRE_SECONDS", "3600"))

# How fast a token's geo/ip context is allowed to change before it's flagged
# as impossible travel (attack demo 2).
IMPOSSIBLE_TRAVEL_WINDOW_SECONDS = int(os.environ.get("SENTINEL_IMPOSSIBLE_TRAVEL_WINDOW", "60"))

# Anchored to this package's directory (not the process cwd) — uvicorn is
# sometimes launched with --app-dir from outside sys1/, and a bare relative
# filename would then create the db wherever the launcher happened to run from.
_DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sentinel_zero.db")
DB_PATH = os.environ.get("SENTINEL_DB_PATH", _DEFAULT_DB_PATH)

# Demo-only credentials. Change before any real deployment.
DEMO_USERS = {
    "admin": os.environ.get("SENTINEL_ADMIN_PASSWORD", "admin123"),
}
