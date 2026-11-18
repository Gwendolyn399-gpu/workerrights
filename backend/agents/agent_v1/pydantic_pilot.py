"""Isolated Pydantic AI pilot for the wage-check tool round trip."""

import json
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.usage import UsageLimits
from openai import AsyncOpenAI

from backend.agents.provider import OpenAICompatibleProvider, ProviderError, build_provider
from backend.services.wage_check import check_amounts
from .runtime import PERSONA_PATH
from .schemas import StrictModel


class WageReply(StrictModel):
    reply: str = Field(min_length=1, max_length=160, description="先说结论，用工地上能听懂的短句。")
    calculated_owed: Decimal | None = Field(description="核账工具算出的欠款。缺少金额时留空。")


@dataclass
class WageInputs:
    tool_results: list[dict] = field(default_factory=list)


def build_wage_agent(model, model_settings=None):
    agent = Agent(
        model,
        deps_type=WageInputs,
        output_type=WageReply,
        model_settings=model_settings,
        instructions=PERSONA_PATH.read_text(encoding="utf-8-sig") + """

这里是独立核账原型。本轮只处理工资金额核对。用户给了应发和累计实际收到的金额，就必须调用 check_wages，再按结果解释。用户没有自己报欠款时，owed_amount 留空，不用算出来的数冒充他的陈述。约定未来要给的钱不算已经收到的钱。对不上时，直接说怎么算、差多少，不替用户猜差额的原因。
""",
    )
    @agent.tool
    def check_wages(
        ctx: RunContext[WageInputs],
        agreed_amount: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)],
        paid_amount: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)],
        owed_amount: Annotated[Decimal, Field(ge=0, allow_inf_nan=False)] | None = None,
    ) -> dict:
        """核对约定总额、实际累计收到的钱、用户说的欠款。不要把付款承诺算成到账。"""
        result = check_amounts({
            "agreed_amount": agreed_amount,
            "paid_amount": paid_amount,
            "owed_amount": owed_amount,
        })
        ctx.deps.tool_results.append(result)
        return result

    @agent.output_validator
    def validate_amount(ctx: RunContext[WageInputs], output: WageReply) -> WageReply:
        checked = ctx.deps.tool_results
        expected = Decimal(checked[-1]["calculated_owed"]) if checked else None
        if output.calculated_owed != expected:
            raise ModelRetry("calculated_owed 必须与核账工具结果一致。没有核账结果时留空。")
        if checked and checked[-1]["conflict"] and expected >= 0:
            reported = checked[-1]["user_reported_owed"]
            output = output.model_copy(update={
                "reply": f"按这两笔数算，还差{expected:f}元。你说的是{reported:f}元，差了{abs(expected - reported):f}元。先核一下应发总数和已经收到的钱。",
            })
        return output

    return agent


def main():
    current = build_provider()
    if not isinstance(current, OpenAICompatibleProvider):
        raise ProviderError("这项实测需要在项目中启用真实模型。")
    client = AsyncOpenAI(base_url=current.base_url, api_key=current.api_key, max_retries=0, timeout=30)
    is_deepseek = urlsplit(current.base_url).hostname == "api.deepseek.com"
    provider = DeepSeekProvider(openai_client=client) if is_deepseek else OpenAIProvider(openai_client=client)
    model = OpenAIChatModel(current.model, provider=provider)
    settings = OpenAIChatModelSettings(thinking=False, temperature=0.3) if is_deepseek else None
    agent = build_wage_agent(model, settings)
    checks = [
        ("总共该给我26000，实际给了8000，我说还欠两万。你帮我算算这账对不对。", Decimal("18000"), True),
        ("一共14000，已经收了5000。他又答应给3000，还没到。现在还欠多少？", Decimal("9000"), False),
    ]
    for question, expected, conflict in checks:
        inputs = WageInputs()
        result = agent.run_sync(question, deps=inputs, usage_limits=UsageLimits(request_limit=5))
        if not inputs.tool_results or result.output.calculated_owed != expected or inputs.tool_results[-1]["conflict"] != conflict:
            raise RuntimeError("核账验收失败，工具结果或最终欠款金额不符。")
        print(json.dumps({"input": question, "tool_results": inputs.tool_results,
                          "output": result.output.model_dump(mode="json")}, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
