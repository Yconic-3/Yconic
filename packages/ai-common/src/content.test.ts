import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { aiSettingsFromEnv, DEFAULT_MODEL, toAiError, type ClaudeContentBlock } from "./claude";
import { echoableContent, textOf, toolUsesOf } from "./content";

const text = (t: string) => ({ type: "text", text: t, citations: null }) as ClaudeContentBlock;
const thinking = () => ({ type: "thinking", thinking: "", signature: "s" }) as ClaudeContentBlock;
const toolUse = (id: string) => ({ type: "tool_use", id, name: "search", input: {} }) as ClaudeContentBlock;
const fallback = () =>
  ({ type: "fallback", from: { model: "a" }, to: { model: "b" }, trigger: { type: "refusal", category: null } }) as ClaudeContentBlock;

describe("echoableContent", () => {
  it("대체 모델이 없으면 받은 그대로 둔다", () => {
    const content = [thinking(), text("안녕"), toolUse("t1")];
    expect(echoableContent(content)).toBe(content);
  });

  it("마지막 fallback 앞의 생각·도구 호출은 빼고, 글과 fallback 뒤는 남긴다", () => {
    const content = [thinking(), toolUse("t1"), text("앞"), fallback(), thinking(), toolUse("t2")];
    const kept = echoableContent(content);
    expect(kept.map((b) => b.type)).toEqual(["text", "fallback", "thinking", "tool_use"]);
    expect(toolUsesOf(kept).map((b) => b.id)).toEqual(["t2"]);
  });
});

describe("textOf", () => {
  it("글 블록만 이어 붙인다", () => {
    expect(textOf([thinking(), text("하나"), toolUse("t"), text("둘")])).toBe("하나\n둘");
  });
});

describe("aiSettingsFromEnv", () => {
  it("키가 없으면 apiKey는 null, 기본 모델과 low 깊이", () => {
    expect(aiSettingsFromEnv({})).toEqual({ apiKey: null, model: DEFAULT_MODEL, effort: "low" });
  });

  it("값을 읽고, 모르는 깊이는 low로 둔다", () => {
    expect(aiSettingsFromEnv({ ANTHROPIC_API_KEY: " k ", AI_MODEL: "m", AI_EFFORT: "아주" })).toEqual({ apiKey: "k", model: "m", effort: "low" });
    expect(aiSettingsFromEnv({ AI_EFFORT: "high" }).effort).toBe("high");
  });
});

describe("toAiError", () => {
  it("연결 오류는 잠시 뒤 다시(AI_BUSY)", () => {
    expect(toAiError(new Anthropic.APIConnectionError({ message: "x" })).code).toBe("AI_BUSY");
  });

  it("모르는 오류는 AI_FAILED", () => {
    expect(toAiError(new Error("x")).code).toBe("AI_FAILED");
  });
});
