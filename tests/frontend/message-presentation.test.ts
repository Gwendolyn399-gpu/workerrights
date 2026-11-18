import { describe, expect, it } from "vitest";
import { citationLabel, readableMessage } from "@/lib/message-presentation";

describe("assistant source presentation", () => {
  it("keeps Chinese text and numbers but moves known source IDs out of prose", () => {
    expect(readableMessage("还差7000元。[mwpr-30] 聊天先留好。[lsr-9]", [{ id: "mwpr-30" }, { id: "lsr-9" }]))
      .toBe("还差7000元。 聊天先留好。");
  });
  it("does not silently remove unknown brackets, placeholders or user data", () => {
    expect(readableMessage("【待补充】[日期][unknown-1]工资7000", [{ id: "law-1" }]))
      .toBe("【待补充】[日期][unknown-1]工资7000");
  });
  it("shows a human-readable legal title and only allows web source links", () => {
    expect(citationLabel({ id: "mwpr-30", article: "第三十条", document: { title: "保障农民工工资支付条例", official_url: "https://example.com/law" } }, 0))
      .toEqual({ title: "保障农民工工资支付条例 · 第三十条", url: "https://example.com/law" });
    expect(citationLabel({ official_url: "javascript:alert(1)" }, 0).url).toBeUndefined();
  });
});
