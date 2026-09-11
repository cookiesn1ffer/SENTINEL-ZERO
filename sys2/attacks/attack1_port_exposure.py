"""Attack Demo 1 — Port Exposure.
Opens real listening sockets on unusual ports, reports the resulting
(degraded) posture to the Policy Engine, then shows a follow-up permission
request getting downgraded because of it. No faked psutil reads."""
import os
import socket
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.client import post
from shared.config import DEVICE_ID
from shared.mode_state import get_mode
from shared.posture import read_posture

ROGUE_PORTS = [4444, 6666, 9001, 13337, 31337]


def open_rogue_sockets(ports):
    socks = []
    for port in ports:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", port))
        s.listen(1)
        socks.append(s)
        print(f"[attack1] opened rogue listening socket on port {port}")
    return socks


def request_browser_baseline(posture):
    body = {
        "app_id": "browser",
        "requested_permissions": ["network", "dns"],  # baseline only, so the
        # decision swing below is attributable purely to posture, not to a
        # conditional permission needing approval.
        "device_posture": posture,
        "mode": get_mode(),
        "timestamp": posture["timestamp"],
    }
    return post("/api/agent/permission-request", body, device_id=DEVICE_ID)


def main():
    print("[attack1] narration cue: 'the moment posture degrades, access degrades too'")

    before_posture = read_posture(DEVICE_ID)
    before = request_browser_baseline(before_posture)
    print("[attack1] BEFORE — browser baseline request:", before.json())

    socks = open_rogue_sockets(ROGUE_PORTS)
    time.sleep(1)

    after_posture = read_posture(DEVICE_ID)
    resp = post("/api/agent/posture", after_posture, device_id=DEVICE_ID)
    print("[attack1] posture report:", resp.status_code, resp.json())

    after = request_browser_baseline(after_posture)
    print("[attack1] AFTER — same browser baseline request:", after.json())

    try:
        input("[attack1] press Enter to close the rogue sockets and clean up...")
    finally:
        for s in socks:
            s.close()
        print("[attack1] rogue sockets closed")


if __name__ == "__main__":
    main()
