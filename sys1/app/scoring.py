from typing import List, Tuple

from .manifests import MANIFESTS

# Ports that are expected/benign on a normal workstation posture check.
TRUSTED_PORTS = {80, 443}

RISK_TIER_BASE_SCORE = {"low": 90, "medium": 78, "high": 62}


def score_posture(open_ports: List[int], firewall_status: str) -> int:
    """0-30 posture score component. Degrades with firewall off / unusual
    open ports, which is exactly what attack demo 1 (port exposure) exercises."""
    score = 30
    if firewall_status != "on":
        score -= 15

    risky_ports = [p for p in open_ports if p not in TRUSTED_PORTS]
    score -= min(len(risky_ports) * 4, 20)

    return max(0, min(30, score))


def score_permission_request(
    app_id: str, requested_permissions: List[str], posture_score: int
) -> Tuple[int, str, str]:
    """Returns (score 0-100, decision, reason)."""
    manifest = MANIFESTS.get(app_id)
    if manifest is None:
        return 0, "CRITICAL", f"'{app_id}' has no registered manifest at all"

    baseline = set(manifest["baseline"])
    conditional: dict = manifest["conditional"]

    undeclared = [p for p in requested_permissions if p not in baseline and p not in conditional]
    if undeclared:
        reason = (
            f"'{app_id}' requested undeclared permission(s) {undeclared} that are "
            f"not present anywhere in its manifest — treated as a manifest violation"
        )
        return 5, "CRITICAL", reason

    needs_approval = [p for p in requested_permissions if conditional.get(p) == "approval"]

    base = RISK_TIER_BASE_SCORE.get(manifest["risk_tier"], 75)
    penalty = len(needs_approval) * 20
    posture_adjustment = posture_score - 15  # 15 is the neutral midpoint of the 0-30 range
    score = max(0, min(100, base - penalty + posture_adjustment))

    if needs_approval:
        decision = "CHALLENGE" if score >= 40 else "DENY"
        reason = (
            f"'{app_id}' requested conditional permission(s) {needs_approval} that "
            f"require approval (score {score}/100)"
        )
    elif score >= 70:
        decision = "ALLOW"
        reason = f"'{app_id}' requested only baseline/auto-approved permissions, posture score {posture_score}/30"
    elif score >= 40:
        decision = "CHALLENGE"
        reason = f"'{app_id}' request scored {score}/100 — degraded device posture"
    else:
        decision = "DENY"
        reason = f"'{app_id}' request scored {score}/100 — below trust threshold"

    return score, decision, reason


def score_access_request(base_trust_score: int, anomaly: bool, anomaly_reason: str = "") -> Tuple[int, str, str]:
    """Generic continuous-authorization check for an already-issued session
    token (used by /api/access/request and attack demo 2 — impossible travel).
    """
    if anomaly:
        return 2, "DENY", anomaly_reason

    score = max(0, min(100, base_trust_score))
    if score >= 70:
        return score, "ALLOW", f"session trust score {score}/100, no anomalies"
    elif score >= 40:
        return score, "CHALLENGE", f"session trust score {score}/100, borderline"
    return score, "DENY", f"session trust score {score}/100, below trust threshold"
