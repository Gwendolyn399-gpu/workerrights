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
        result = self.intake.handle_message(case, text) if self.provider.is_mock else self.intake.handle_message(case, text, emit=emit)
        self.db.commit()
        self.db.refresh(case)
        result["facts"] = case.facts
        result["progress"] = result.get("progress")
        result["status"] = case.status
        result["provider"] = self.provider.health()
        return result

    def get_analysis(self, case: Case) -> dict:
        return self.analysis.run(case)

    def get_legal_basis(self, case: Case) -> dict:
        return self.legal.run(case)

    def ensure_action_plan(self, case: Case) -> dict:
        plan = self.action.ensure_plan(case)
        self.db.commit()
        self.db.refresh(case)
        return plan

    def get_form_assistant(self, case: Case) -> dict:
        return self.form.run(case)

    def mark_case_confirmed(self, case: Case) -> None:
        case.status = "ready"
        case.updated_at = utcnow()
        self.db.commit()
