from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FactPatch(StrictModel):
    location_province: str | None = None
    location_city: str | None = None
    location_district: str | None = None
    location_detail: str | None = None
    work_type: str | None = None
    duration_text: str | None = None
    work_start: date | None = None
    work_end: date | None = None
    recruiter_type: str | None = None
    recruiter_name: str | None = None
    manager_role: str | None = None
    wage_basis: str | None = None
    daily_wage: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    monthly_wage: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    agreed_amount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    paid_amount: float | None = Field(default=None, ge=0, allow_inf_nan=False,
                                      description="截至目前累计实际到账金额，不是本次新付款，也不是付款承诺。此前累计未知时，不能只凭新到账1000就把累计写1000；新增付款记入进展。")
    owed_amount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    owed_amount_approx: bool | None = None
    has_contract: Literal["yes", "no", "unknown"] | None = Field(default=None,
                                                                  description="仅用户明确是否签订书面合同/协议时填写。聊天没有签字、没人承认欠款，不等于没有合同。")
    evidence: list[Literal["chat", "attendance", "wage_sheet", "transfer", "iou", "photos", "badge", "witness", "recording", "contract"]] | None = None
    evidence_status: Literal["none", "some", "unknown"] | None = None
    project_name: str | None = None
    contractor_name: str | None = None
    prior_report: Literal["yes", "no"] | None = None
    prior_report_detail: str | None = None


class RecordFacts(StrictModel):
    patch: FactPatch
    source_quote: str = Field(min_length=1, max_length=2000)


class SearchLaw(StrictModel):
    query: str = Field(min_length=1, max_length=300)


class NoArguments(StrictModel):
    pass


class UpdateCaseMemory(StrictModel):
    goal: str | None = Field(default=None, max_length=500)
    constraints: list[str] | None = Field(default=None, max_length=12)
    event: str | None = Field(default=None, max_length=1000,
                              description="现实中已经发生的催款行动、对方反馈、付款承诺或实际到账。用户要求写草稿、提问方式、要求别编内容是本轮任务，不是案件处理进展，不记录为event。")
    source_quote: str = Field(min_length=1, max_length=2000)


class Respond(StrictModel):
    reply: str = Field(min_length=1, max_length=6000,
                       description="像当面聊天一样，只说眼下能做的一步，通常40–140字、至多两小段；不用法条课、官话和长清单。用户本轮明确要完整材料才展开。不得编造事实、认账内容或把承诺当到账。")
    response_kind: Literal["chat", "document"] = Field(default="chat", description="日常问答/更正/汇报进展选chat；仅当前用户明确要求整份草稿、事实陈述或证据目录时选document。")
    next_question: str | None = None
    stage: Literal["waiting_user", "awaiting_confirmation", "ready"]
    citation_ids: list[str] = Field(default_factory=list)


TOOL_MODELS = {
    "update_case_memory": (UpdateCaseMemory, "保存用户本轮明确陈述的目标、联系偏好/限制、已采取行动及反馈。goal 只在变化时填；constraints 若填须保留仍有效的限制；event 记录本次进展，区分承诺和到账。source_quote 逐字来自本轮。没有变化不调用。"),
    "record_facts": (RecordFacts, "记录或纠正用户明确说过的事实；source_quote逐字来自本轮用户消息。也可引用同一案件已保存的用户原话补记缺失字段，但历史不能覆盖已有值/更正，不能引用助手推测。patch仅包含变化字段，证据列表为合并后的完整列表。"),
    "search_law": (SearchLaw, "查询本地法律条文；保留核验状态，不能当作已在线核验。"),
    "check_amounts": (NoArguments, "用程序核对已记录的总额、已付与欠款，返回冲突，不自动改金额。"),
    "inspect_evidence": (NoArguments, "根据当前事实查看已有证据及缺口。"),
    "prepare_materials": (NoArguments, "根据已记录事实生成待核对的事实陈述和证据目录草稿。"),
    "respond": (Respond, "结束本轮，自然回应当前问题。可以不提问，next_question=null；必要时至多追问一件事。reply 放参数第一项。ready 仅在用户明确确认已有摘要后使用。"),
}


def tool_definitions() -> list[dict]:
    return [
        {"type": "function", "function": {"name": name, "description": description, "parameters": model.model_json_schema()}}
        for name, (model, description) in TOOL_MODELS.items()
    ]
