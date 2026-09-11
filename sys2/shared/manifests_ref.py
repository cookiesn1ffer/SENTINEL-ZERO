"""Reference copy of the app manifests for building realistic agent traffic
and the attack demos. This is NOT the source of truth — Aarush's server
(sys1/app/manifests.py) owns matching/scoring. Keep in sync with it by hand;
if it drifts, that's worth flagging rather than silently diverging."""

MANIFESTS = {
    "notes": {
        "baseline": [],
        "conditional": {"multi_app_context": "auto"},
        "risk_tier": "low",
    },
    "browser": {
        "baseline": ["network", "dns"],
        "conditional": {"camera": "approval"},
        "risk_tier": "high",
    },
    "music": {
        "baseline": ["audio", "network"],
        "conditional": {},
        "risk_tier": "medium",
    },
    "document_editor": {
        "baseline": [],
        "conditional": {"network": "approval"},
        "risk_tier": "medium",
    },
}
