"""Attack Demo 2 — Impossible Travel / Token Theft.
Reuses a single valid JWT across two requests tagged with different geo
within an implausible time window; the second one should be denied even
though the token itself is still technically valid."""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.client import get_token, post
from shared.config import DEVICE_ID


def main():
    token = get_token(DEVICE_ID, force=True)
    print(f"[attack2] issued fresh token: {token[:24]}...")

    print("[attack2] request #1 — geo=Pune")
    r1 = post("/api/access/request", {"resource": "/reports/sensitive", "geo": "Pune"}, device_id=DEVICE_ID)
    print("  ->", r1.json())

    print("[attack2] waiting 5s, then replaying the SAME token tagged geo=Singapore...")
    time.sleep(5)

    r2 = post("/api/access/request", {"resource": "/reports/sensitive", "geo": "Singapore"}, device_id=DEVICE_ID)
    print("[attack2] request #2 ->", r2.json())
    print("[attack2] narration cue: 'even a technically valid token gets rejected "
          "because the context around it doesn't hold up'")


if __name__ == "__main__":
    main()
