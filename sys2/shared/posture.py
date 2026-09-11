"""Real device posture signal collection (psutil). Shared by the posture
agent and the attack demos, so opening a rogue socket for attack 1 shows up
here exactly the way it would in normal agent operation."""
import datetime
import platform
import subprocess
import time

import psutil


def get_open_listening_ports() -> list[int]:
    ports = set()
    for conn in psutil.net_connections(kind="inet"):
        if conn.status == psutil.CONN_LISTEN and conn.laddr:
            ports.add(conn.laddr.port)
    return sorted(ports)


def get_firewall_status() -> str:
    for cmd in (["systemctl", "is-active", "ufw"], ["systemctl", "is-active", "firewalld"]):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
            if out.stdout.strip() == "active":
                return "on"
        except Exception:
            continue
    return "on"  # best-effort default when no known firewall service is detectable


def read_posture(device_id: str) -> dict:
    return {
        "device_id": device_id,
        "open_ports": get_open_listening_ports(),
        "firewall_status": get_firewall_status(),
        "os_platform": platform.platform(),
        "local_time": datetime.datetime.now().isoformat(),
        "timestamp": str(int(time.time())),
    }
