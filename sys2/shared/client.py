import time

import requests

from .config import PASSWORD, SERVER_URL, USERNAME

_token = None
_token_expiry = 0.0


def get_token(device_id: str | None = None, force: bool = False) -> str:
    global _token, _token_expiry
    if _token and not force and time.time() < _token_expiry - 30:
        return _token

    resp = requests.post(
        f"{SERVER_URL}/api/auth/login",
        json={"username": USERNAME, "password": PASSWORD, "device_id": device_id},
        timeout=5,
    )
    resp.raise_for_status()
    data = resp.json()
    _token = data["token"]
    _token_expiry = time.time() + data.get("expires_in", 3600)
    return _token


def _headers(device_id: str | None = None) -> dict:
    return {"Authorization": f"Bearer {get_token(device_id)}"}


def post(path: str, json_body: dict, device_id: str | None = None) -> requests.Response:
    return requests.post(f"{SERVER_URL}{path}", json=json_body, headers=_headers(device_id), timeout=5)


def get(path: str, device_id: str | None = None) -> requests.Response:
    return requests.get(f"{SERVER_URL}{path}", headers=_headers(device_id), timeout=5)
