import os
import socket

SERVER_URL = os.environ.get("SENTINEL_SERVER_URL", "http://127.0.0.1:8000")
USERNAME = os.environ.get("SENTINEL_USERNAME", "admin")
PASSWORD = os.environ.get("SENTINEL_PASSWORD", "admin123")

# All agent/attack scripts default to the same device_id so the dashboard
# shows one coherent session/device during a live demo, unless overridden.
DEVICE_ID = os.environ.get("SENTINEL_DEVICE_ID", socket.gethostname())
