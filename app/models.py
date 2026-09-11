from typing import List, Literal, Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str
    device_id: Optional[str] = None  # not in the original contract, but lets us
    # bind a session to a device for posture-driven scoring; optional so callers
    # that don't send it still work.


class LoginResponse(BaseModel):
    token: str
    expires_in: int


class PostureSignal(BaseModel):
    device_id: str
    open_ports: List[int]
    firewall_status: Literal["on", "off"]
    os_platform: str
    local_time: str
    timestamp: str
    # Extra, optional fields Sourabh's attack-demo 2 script can set to simulate
    # a request originating from a different network context. Not required.
    geo: Optional[str] = None
    client_ip: Optional[str] = None


class PostureResponse(BaseModel):
    posture_score_component: int


class PermissionRequest(BaseModel):
    app_id: str
    requested_permissions: List[str]
    device_posture: PostureSignal
    mode: Literal["manual", "auto"]
    timestamp: str


class PermissionResponse(BaseModel):
    decision: Literal["ALLOW", "CHALLENGE", "DENY", "CRITICAL"]
    score: int
    reason: str
    pending_admin_action: bool
    event_id: str


class AdminDecisionRequest(BaseModel):
    event_id: str
    admin_decision: Literal["approve", "deny"]


class AdminDecisionResponse(BaseModel):
    status: str


class KillSwitchRequest(BaseModel):
    target: str
    reason: str


class KillSwitchResponse(BaseModel):
    status: str
    event_id: str


class AccessRequest(BaseModel):
    """Generic continuous-authorization check for an already-issued token —
    not in the original contract verbatim, but implied by the event feed's
    `type: "api_request"` variant. Used by attack demo 2 (impossible travel)."""

    resource: str
    geo: Optional[str] = None
    client_ip: Optional[str] = None
    timestamp: Optional[str] = None


class AccessResponse(BaseModel):
    decision: Literal["ALLOW", "CHALLENGE", "DENY", "CRITICAL"]
    score: int
    reason: str
    event_id: str


class EventOut(BaseModel):
    event_id: str
    type: str
    subject: str
    resource_or_permission: Optional[str]
    score: Optional[int]
    decision: str
    reason: Optional[str]
    mode: Optional[str]
    timestamp: str
    pending_admin_action: bool
