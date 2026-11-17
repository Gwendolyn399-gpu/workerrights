import re

from fastapi import HTTPException, Header
from sqlalchemy.orm import Session

from backend.models.case import Case

SESSION_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def get_session_id(x_session_id: str | None = Header(default=None)) -> str:
    if not x_session_id or not SESSION_PATTERN.match(x_session_id):
        raise HTTPException(
            status_code=400,
            detail="缺少或无效的 X-Session-Id。请在浏览器中重新打开页面后重试。",
        )
    return x_session_id


def get_owned_case(db: Session, case_id: str, session_id: str) -> Case:
    case = db.get(Case, case_id)
    if not case or case.session_id != session_id:
        # Do not reveal whether another user's case exists.
        raise HTTPException(status_code=404, detail="案件不存在或无权访问。")
    return case
