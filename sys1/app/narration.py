"""Rich terminal narration for the policy engine's own console. Every
decision, posture read, and admin action prints a human-readable line here
so the server's terminal doubles as a live narrated feed during the demo —
not just an access log."""

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"

DECISION_COLOR = {
    "ALLOW": "\033[92m",      # green
    "CHALLENGE": "\033[93m",  # yellow
    "DENY": "\033[38;5;208m",  # orange
    "CRITICAL": "\033[91m",   # red
}
DECISION_GLYPH = {"ALLOW": "✓", "CHALLENGE": "?", "DENY": "✗", "CRITICAL": "!!"}


def narrate_decision(decision: str, subject: str, resource: str, score, reason: str):
    color = DECISION_COLOR.get(decision, RESET)
    glyph = DECISION_GLYPH.get(decision, "-")
    header = f"{color}{BOLD}[{glyph}] {decision:<10}{RESET} {subject} → {resource}  {DIM}(score {score}){RESET}"
    print(f"{header}\n      {DIM}{reason}{RESET}")


def narrate_posture(device_id: str, score: int, firewall: str, open_ports: list):
    tone = "\033[92m" if score >= 20 else "\033[93m" if score >= 10 else "\033[91m"
    print(f"{tone}[posture]{RESET} {device_id}  score={score}/30  firewall={firewall}  ports={open_ports}")


def narrate_kill(target: str, reason: str):
    print(f"\033[91m{BOLD}[KILL SWITCH]{RESET} {target}  {DIM}{reason}{RESET}")


def narrate_admin(event_id: str, decision: str):
    color = "\033[92m" if decision == "approve" else "\033[91m"
    print(f"{color}[admin]{RESET} {decision} → event {event_id}")
