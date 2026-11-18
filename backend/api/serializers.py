from backend.models.case import Case, Message
from backend.services.facts import required_progress


def serialize_message(message: Message) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "meta": message.meta or {},
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def serialize_case(case: Case, include_messages: bool = True) -> dict:
    done_steps = sum(1 for step in case.steps if step.done)
    payload = {
        "id": case.id,
        "title": case.title,
        "scene": case.scene,
        "status": case.status,
        "is_demo": case.is_demo,
        "facts": case.facts,
        "intake": {
            "confirmed": bool((case.intake or {}).get("confirmed")),
            "unknowns": (case.intake or {}).get("unknowns", {}),
            "skipped": (case.intake or {}).get("skipped", []),
            "agent_memory": (case.intake or {}).get("agent_memory", {}),
            "agent_materials": (case.intake or {}).get("agent_materials", {}),
            "agent_stage": (case.intake or {}).get("agent_stage"),
        },
        "progress": required_progress(case.facts, case.intake or {}),
        "step_progress": {
            "done": done_steps,
            "total": len(case.steps),
            "percent": round(done_steps / len(case.steps) * 100) if case.steps else 0,
        },
        "plan_generated_at": case.plan_generated_at.isoformat()
        if case.plan_generated_at
        else None,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
    }
    if include_messages:
        payload["messages"] = [serialize_message(message) for message in case.messages]
    return payload


def serialize_case_brief(case: Case) -> dict:
    progress = required_progress(case.facts, case.intake or {})
    return {
        "id": case.id,
        "title": case.title,
        "scene": case.scene,
        "status": case.status,
        "is_demo": case.is_demo,
        "city": case.facts.get("location_city"),
        "district": case.facts.get("location_district"),
        "work_type": case.facts.get("work_type"),
        "owed_amount": case.facts.get("owed_amount"),
        "owed_amount_approx": case.facts.get("owed_amount_approx"),
        "progress": progress,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
    }
