"""Device posture agent. Reports open ports, firewall status, OS/platform,
and local time to the Policy Engine on a loop."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.client import post
from shared.config import DEVICE_ID
from shared.posture import read_posture

POLL_SECONDS = int(os.environ.get("SENTINEL_POSTURE_INTERVAL", "10"))


def main():
    print(f"[posture-agent] reporting as device_id={DEVICE_ID} every {POLL_SECONDS}s")
    while True:
        payload = read_posture(DEVICE_ID)
        try:
            resp = post("/api/agent/posture", payload, device_id=DEVICE_ID)
            print(f"[posture-agent] {payload['timestamp']} ports={payload['open_ports']} -> "
                  f"{resp.status_code} {resp.json()}")
        except Exception as e:
            print(f"[posture-agent] failed to reach server: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
