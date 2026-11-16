import { describe, expect, it } from "vitest";
import { AiError, limitFromEnv, withDailyLimit, type AiModel, type ClaudeMessage } from "./claude";

const fake: AiModel = { name: "fake", run: async () => ({}) as ClaudeMessage };

describe("하루 AI 사용 한도", () => {
  it("한도까지만 부르고, 넘으면 AI_BUSY로 알린다. 다음 날 다시 센다", async () => {
    let now = new Date("2026-11-12T10:00:00Z");
    const limited = withDailyLimit(fake, 2, "영상 분석", () => now);
    await limited.run({ messages: [], max_tokens: 1 });
    await limited.run({ messages: [], max_tokens: 1 });
    await expect(limited.run({ messages: [], max_tokens: 1 })).rejects.toMatchObject({ code: "AI_BUSY" });
    await expect(limited.run({ messages: [], max_tokens: 1 })).rejects.toBeInstanceOf(AiError);
    now = new Date("2026-11-13T00:10:00Z");
    await expect(limited.run({ messages: [], max_tokens: 1 })).resolves.toBeDefined();
  });

  it("한도가 없으면 그대로 쓴다", () => {
    expect(withDailyLimit(fake, undefined, "x")).toBe(fake);
    expect(limitFromEnv("30")).toBe(30);
    expect(limitFromEnv("")).toBeUndefined();
    expect(limitFromEnv("abc")).toBeUndefined();
  });
});
