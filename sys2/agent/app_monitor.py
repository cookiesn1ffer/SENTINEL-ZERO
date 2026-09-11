"""App permission layer. Detects which of the four demo apps are actually
running via psutil process names; if none are found (e.g. the demo laptop
doesn't have them installed), falls back to simulating plausible traffic for
all four so the dashboard stays populated during a live pitch. Either way,
permission usage itself is simulated per-app from its manifest — there's no
cross-platform way to observe "is this process actually touching the
network/camera/audio right now" within a hackathon window."""
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psutil

from shared.client import post
from shared.config import DEVICE_ID
from shared.manifests_ref import MANIFESTS
from shared.mode_state import get_mode
from shared.posture import read_posture

POLL_SECONDS = int(os.environ.get("SENTINEL_APP_MONITOR_INTERVAL", "12"))

PROCESS_NAME_MAP = {
    "notes": ["gnome-text-editor", "notepad.exe", "textedit", "notes"],
    "browser": ["firefox", "chrome", "chromium", "msedge", "safari"],
    "music": ["spotify", "rhythmbox", "vlc"],
    "document_editor": ["soffice", "winword", "pages"],
}


def detect_running_apps() -> list[str]:
    names = {p.info["name"].lower() for p in psutil.process_iter(["name"]) if p.info.get("name")}
    running = [
        app for app, procs in PROCESS_NAME_MAP.items()
        if any(proc in name for name in names for proc in procs)
    ]
    return running or list(MANIFESTS.keys())  # nothing detected -> simulate all four


def permissions_for(app_id: str) -> list[str]:
    manifest = MANIFESTS[app_id]
    perms = list(manifest["baseline"])
    for perm, kind in manifest["conditional"].items():
        if kind == "auto" or random.random() < 0.3:
            perms.append(perm)
    return perms


def main():
    print(f"[app-monitor] watching for {list(PROCESS_NAME_MAP)} every {POLL_SECONDS}s")
    while True:
        apps = detect_running_apps()
        posture = read_posture(DEVICE_ID)
        for app_id in apps:
            body = {
                "app_id": app_id,
                "requested_permissions": permissions_for(app_id),
                "device_posture": posture,
                "mode": get_mode(),
                "timestamp": posture["timestamp"],
            }
            try:
                resp = post("/api/agent/permission-request", body, device_id=DEVICE_ID)
                print(f"[app-monitor] {app_id} requested {body['requested_permissions']} -> {resp.json()}")
            except Exception as e:
                print(f"[app-monitor] failed to reach server: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
