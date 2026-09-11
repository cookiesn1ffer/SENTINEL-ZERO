"""Attack Demo 3 — App Manifest Violation (simulated process injection).
The 'notes' app (baseline_permissions=[]) suddenly requests 'network', which
isn't declared anywhere in its manifest -> CRITICAL + automatic kill-switch
on the device. This is manifest/behavioral-deviation detection, not real
process-injection detection or malware analysis — keep that framing in the
pitch."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.client import get, post
from shared.config import DEVICE_ID
from shared.mode_state import get_mode
from shared.posture import read_posture


def main():
    posture = read_posture(DEVICE_ID)
    body = {
        "app_id": "notes",
        "requested_permissions": ["network"],
        "device_posture": posture,
        "mode": get_mode(),
        "timestamp": posture["timestamp"],
    }
    print("[attack3] narration cue: 'notes' suddenly requesting an undeclared permission: network")
    resp = post("/api/agent/permission-request", body, device_id=DEVICE_ID)
    print("[attack3] result:", resp.json())

    status = get("/api/dashboard/kill-switch-status", device_id=DEVICE_ID)
    print("[attack3] kill-switch status:", status.json())


if __name__ == "__main__":
    main()
