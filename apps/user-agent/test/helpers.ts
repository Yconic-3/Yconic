import type { AddressInfo } from "node:net";
import type { AgentRequest, AiModel, ClaudeContentBlock, ClaudeMessage } from "@yconic/ai-common";
import { createFixtures } from "@yconic/fixtures";
import { isVisibleToUsers, toPublishedExercise, type PublishedExercise } from "@yconic/shared-types";
import type { Backend } from "../src/backend";
import { createAgentServer } from "../src/server";

/** 예시 데이터의 공개 운동 4개 (목 스트레칭 c-neck, 스쿼트 c-squat, 벽 밀기 c-wall, 제자리 걷기 c-march) */
export function publishedExercises(): PublishedExercise[] {
  return createFixtures(Date.now()).contents.filter(isVisibleToUsers).map(toPublishedExercise);
}

export function fakeBackend(list = publishedExercises()): Backend & { calls: number } {
  const backend = {
    calls: 0,
    async listExercises() {
      backend.calls++;
      return list;
    },
  };
  return backend;
}

type Block =
  | { text: string }
  | { tool: string; input: Record<string, unknown>; id?: string }
  | { fallback: true }
  | { thinking: true };

let seq = 0;

function block(b: Block): ClaudeContentBlock {
  if ("text" in b) return { type: "text", text: b.text, citations: null } as ClaudeContentBlock;
  if ("tool" in b) return { type: "tool_use", id: b.id ?? `tu_${++seq}`, name: b.tool, input: b.input } as ClaudeContentBlock;
  if ("fallback" in b) {
    return { type: "fallback", from: { model: "a" }, to: { model: "b" }, trigger: { type: "refusal", category: null } } as ClaudeContentBlock;
  }
  return { type: "thinking", thinking: "", signature: "sig" } as ClaudeContentBlock;
}

/** 가짜 Claude 응답 하나 */
export function reply(blocks: Block[], stopReason?: ClaudeMessage["stop_reason"]): ClaudeMessage {
  const content = blocks.map(block);
  return {
    id: `msg_${++seq}`,
    type: "message",
    role: "assistant",
    model: "fake",
    content,
    stop_reason: stopReason ?? (content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn"),
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as ClaudeMessage;
}

/** 정해 둔 응답을 차례로 돌려주고, 받은 요청을 기억하는 가짜 모델 */
export function scriptedModel(responses: ClaudeMessage[]): AiModel & { requests: AgentRequest[] } {
  const queue = [...responses];
  const requests: AgentRequest[] = [];
  return {
    name: "fake",
    requests,
    async run(request) {
      // 요청 배열이 나중에 바뀌어도 그때 모양을 남긴다
      requests.push(structuredClone(request));
      const next = queue.shift();
      if (!next) throw new Error("준비한 응답이 없습니다");
      return next;
    },
  };
}

export async function startServer(opts: { model: AiModel | null; backend?: Backend; rateLimitPerMinute?: number }) {
  const server = createAgentServer({
    config: { webOrigins: ["http://localhost:3000"], rateLimitPerMinute: opts.rateLimitPerMinute ?? 100 },
    model: opts.model,
    backend: opts.backend ?? fakeBackend(),
    quiet: true,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
