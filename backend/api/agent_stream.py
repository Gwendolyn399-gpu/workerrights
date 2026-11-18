import json
from queue import Empty, Full, Queue
from threading import Event, Thread

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.agents.provider import ProviderError
from backend.api.deps import get_owned_case, get_session_id
from backend.api.router import process_message
from backend.api.schemas import SendMessageRequest
from backend.database.db import SessionLocal, get_db

router = APIRouter()


@router.post("/cases/{case_id}/messages/stream")
def stream_message(case_id: str, payload: SendMessageRequest,
                   session_id: str = Depends(get_session_id), db: Session = Depends(get_db)):
    get_owned_case(db, case_id, session_id)
    if not payload.content.strip():
        raise HTTPException(status_code=422, detail="消息不能为空。")

    def events():
        queue: Queue = Queue(maxsize=32)
        cancelled = Event()

        def emit(event):
            while not cancelled.is_set():
                try:
                    queue.put(event, timeout=0.25)
                    return
                except Full:
                    continue
            raise ProviderError("客户端已断开，本轮停止。")

        def work():
            try:
                with SessionLocal() as worker_db:
                    result = process_message(case_id, payload, session_id, worker_db, emit=emit)
                emit({"type": "done", "result": result})
            except Exception as exc:
                # Never send provider bodies, credentials, or Python internals over the stream.
                if not cancelled.is_set():
                    emit({"type": "error", "message": str(exc) if isinstance(exc, ProviderError) else "本轮处理失败，未完成的回复不会保存，请重试。"})

        worker = Thread(target=work, daemon=True)
        worker.start()
        try:
            while True:
                try:
                    event = queue.get(timeout=0.5)
                except Empty:
                    yield ": heartbeat\n\n"
                    continue
                yield "data: " + json.dumps(event, ensure_ascii=True) + "\n\n"
                if event["type"] in {"done", "error"}:
                    break
        finally:
            cancelled.set()

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})
