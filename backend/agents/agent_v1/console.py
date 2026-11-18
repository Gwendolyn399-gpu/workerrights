"""Run: python -m backend.agents.agent_v1.console [--replay]."""
import argparse
import json

from backend.agents.provider import ProviderError, build_provider
from backend.database.db import SessionLocal, init_database
from backend.legal.retriever import LegalRetriever
from backend.services.fact_extractor import NEW_CASE_FACTS
from .runtime import AgentRuntime, AgentState
from .boundary import ScopedAgentRuntime


class ReplayModel:
    """Scripted protocol test only. This class is never used by the web app."""
    def __init__(self):
        self.actions = iter([
            ("record_facts", {"patch": {"agreed_amount": 26000, "paid_amount": 8000, "owed_amount": 20000}, "source_quote": "总共26000，付了8000，还欠20000"}),
            ("check_amounts", {}),
            ("respond", {"reply": "【脚本回放】总额减去已付是18000元，与陈述的20000元有出入，请核对。", "next_question": "欠款金额是多少？", "stage": "waiting_user"}),
        ])

    def complete(self, messages, tools, *, final):
        name, args = next(self.actions)
        return {"message": {"role": "assistant", "tool_calls": [{"id": f"replay-{name}", "type": "function", "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}]}, "usage": {}}


def main():
    parser = argparse.ArgumentParser(description="工友 Agent v1 独立调试；/state 查看状态，/reset 新会话，/quit 退出。")
    parser.add_argument("--replay", action="store_true", help="离线脚本回放，不是 AI 效果测试")
    args = parser.parse_args()
    if args.replay:
        result = AgentRuntime(ReplayModel(), lambda query: []).run(AgentState(), "总共26000，付了8000，还欠20000")
        print(result.reply)
        print(json.dumps(result.trace, ensure_ascii=False, indent=2))
        return
    model = build_provider()
    if model.is_mock:
        raise ProviderError("未启用真实模型。请按 docs/agent-v1.md 配置；--replay 仅演示程序循环。")
    init_database()
    state = AgentState(facts=dict(NEW_CASE_FACTS))
    print("工友 Agent v1 / 真实模型；发送内容会交给配置的模型服务。先使用虚构案例。")
    with SessionLocal() as db:
        runtime = ScopedAgentRuntime(model, lambda query: LegalRetriever(db).search(query, top_k=4))
        while True:
            text = input("你 > ").strip()
            if text == "/quit":
                break
            if text == "/reset":
                state = AgentState(facts=dict(NEW_CASE_FACTS))
                continue
            if text == "/state":
                print(json.dumps({"facts": state.facts, "sources": state.sources, "stage": state.stage}, ensure_ascii=False, indent=2))
                continue
            if not text:
                continue
            try:
                result = runtime.run(state, text)
            except ProviderError as exc:
                print(f"调用失败，未更新状态：{exc}")
                continue
            state = result.state
            print("工友 >", result.reply)
            print(json.dumps({"actions": result.trace, "usage": result.usage}, ensure_ascii=False))


if __name__ == "__main__":
    main()
