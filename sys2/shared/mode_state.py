"""Shared manual/auto mode flag. The dashboard's toggle and the agent
scripts read/write this same local file so they agree on the current mode
without System 1 needing to own any mode-setting endpoint (there isn't one
in the API contract). Assumes agent + dashboard run on the same machine,
which holds for the hackathon demo setup."""
import json
import os

MODE_FILE = os.environ.get(
    "SENTINEL_MODE_FILE",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".mode_state.json"),
)


def get_mode() -> str:
    try:
        with open(MODE_FILE) as f:
            return json.load(f).get("mode", "auto")
    except (FileNotFoundError, json.JSONDecodeError):
        return "auto"


def set_mode(mode: str) -> None:
    with open(MODE_FILE, "w") as f:
        json.dump({"mode": mode}, f)
