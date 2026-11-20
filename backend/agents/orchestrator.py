from copy import deepcopy

from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.agents.action_planning import ActionPlanningAgent
from backend.agents.case_analysis import CaseAnalysisAgent
from backend.agents.form_assistant import FormAssistantAgent
from backend.agents.intake import IntakeAgent
from backend.agents.agent_v1.intake import AgentIntake
from backend.agents.legal_research import LegalResearchAgent
from backend.agents.provider import AgentProvider, build_provider
from backend.models.case import Case, utcnow
from backend.services.fact_extractor import NEW_CASE_FACTS
from backend.services.facts import record_fact_change, required_progress


class AgentOrchestrator:
    """Coordinates the five agents and keeps persistence outside the UI."""

    def __init__(self, db: Session, provider: AgentProvider | None = None) -> None:
        self.db = db
        self.provider = provider or build_provider()
        self.intake = IntakeAgent(db, self.provider) if self.provider.is_mock else AgentIntake(db, self.provider)
        self.legal = LegalResearchAgent(db)
        self.analysis = CaseAnalysisAgent(db)
        self.action = ActionPlanningAgent(db)
        self.form = FormAssistantAgent()

    def create_case(self, session_id: str, scene: str = "construction_wage_arrears", is_demo: bool = False) -> Case:
        if scene != "construction_wage_arrears":
            raise ValueError("首期仅完整支持建筑工地欠薪场景。")
        case = Case(
            session_id=session_id,
            scene=scene,
            title="新的欠薪咨询",
            is_demo=is_demo,
            status="collecting",
            facts=dict(NEW_CASE_FACTS),
            facts_meta={},
            intake={},
        )
        self.db.add(case)
        self.db.flush()
        self.intake.start_case(case)
        self.db.commit()
        self.db.refresh(case)
        return case

    def handle_message(self, case: Case, text: str, emit=None) -> dict:
        before = deepcopy(case.facts)
        was_confirmed = bool((case.intake or {}).get("confirmed"))
        result = self.intake.handle_message(case, text) if self.provider.is_mock else self.intake.handle_message(case, text, emit=emit)
        # Intake may flush internally: compare captured values, not ORM history.
        confirmed_this_turn = bool(case.intake.get("confirmed")) and (
            not was_confirmed or (
                not self.provider.is_mock and case.intake.get("agent_stage") == "ready"
            )
        )
        changed = record_fact_change(case, before, preserve_confirmation=confirmed_this_turn)
        if confirmed_this_turn and (not was_confirmed or changed):
            case.derived_results = {}
        self.db.commit()
        self.db.refresh(case)
        result["facts"] = case.facts
        result["progress"] = required_progress(case.facts, case.intake)
        result["status"] = case.status
        result["provider"] = self.provider.health()
        return result

    def _derived_result(self, case: Case, key: str, generate) -> dict:
        self.db.flush()
        # A no-op write serializes SQLite cache misses without changing timestamps.
        self.db.execute(update(Case).where(Case.id == case.id).values(
            updated_at=Case.updated_at
        ).execution_options(synchronize_session=False))
        self.db.refresh(case)
        if key not in case.derived_results:
            result = deepcopy(generate())
            result["generated_from_revision"] = case.facts_revision
            case.derived_results = {**case.derived_results, key: result}
            self.db.commit()
        # GET retains stale snapshots; response overlays must not enter the cache.
        return deepcopy(case.derived_results[key])

    def get_analysis(self, case: Case) -> dict:
        return self._derived_result(case, "analysis", lambda: self.analysis.run(case))

    def get_legal_basis(self, case: Case) -> dict:
        return self.legal.run(case)

    def ensure_action_plan(self, case: Case) -> dict:
        return self._derived_result(
            case, "action_plan", lambda: self.action.ensure_plan(case, force=True)
        )

    def get_form_assistant(self, case: Case) -> dict:
        return self._derived_result(case, "form_assistant", lambda: self.form.run(case))

    def mark_case_confirmed(self, case: Case) -> None:
        if not (case.intake or {}).get("confirmed"):
            case.derived_results = {}
        case.intake = {**(case.intake or {}), "confirmed": True}
        case.status = "ready"
        case.updated_at = utcnow()
        self.db.commit()
