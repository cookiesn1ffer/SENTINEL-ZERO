"""
App permission manifests. Each conditional permission maps to how it's
resolved when requested:
  "auto"     -> auto-approved, treated like baseline for scoring purposes
  "approval" -> always forces a CHALLENGE (or DENY if trust is already low)

Anything an app requests that isn't in baseline or conditional at all is
undeclared -> CRITICAL (manifest violation / simulated injection).
"""

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
        "conditional": {"network": "approval"},  # requested when cloud_sync_enabled
        "risk_tier": "medium",
    },
}
