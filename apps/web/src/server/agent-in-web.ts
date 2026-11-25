import { aiSettingsFromEnv, createClaudeModel, limitFromEnv, withDailyLimit, type AiModel } from "@yconic/ai-common";
import { createFixtures } from "@yconic/fixtures";
import { isVisibleToUsers, toPublishedExercise } from "@yconic/shared-types";
import type { Backend } from "@yconic/user-agent/core";

/**
 * 웹앱 안에서 돌리는 사용자 에이전트 (Vercel 배포용, docs/decisions/0012).
 * 4100번 에이전트 서버를 따로 둘 수 없는 곳에서 /agent/health, /agent/chat 을 웹앱의 서버 함수가 맡는다.
 * - AGENT_IN_WEB=1 이고 ANTHROPIC_API_KEY 가 있을 때만 켠다. 아니면 꺼짐으로 답해 화면이 규칙 기반 해석을 쓴다
 * - 운동 목록은 예시 데이터(@yconic/fixtures)의 공개 운동을 쓴다 (예시 데이터 모드와 같은 목록)
 * - 하루 AI 한도(AI_DAILY_LIMIT)와 접속 주소마다 분당 요청 수(AGENT_RATE_LIMIT)를 둔다. 서버 함수 인스턴스마다 따로 센다
 */

export function agentInWebEnabled(): boolean {
  return process.env.AGENT_IN_WEB === "1";
}

let model: AiModel | null | undefined;
export function agentModel(): AiModel | null {
  if (model !== undefined) return model;
  const settings = aiSettingsFromEnv();
  model = settings.apiKey
    ? withDailyLimit(createClaudeModel({ settings: { ...settings, apiKey: settings.apiKey } }), limitFromEnv(process.env.AI_DAILY_LIMIT) ?? 300, "대화")
    : null;
  return model;
}

export const fixtureBackend: Backend = {
  async listExercises() {
    return createFixtures(Date.now()).contents.filter(isVisibleToUsers).map(toPublishedExercise);
  },
};

const hits = new Map<string, number[]>();
/** 한 접속 주소가 1분에 보낼 수 있는 요청 수 */
export function allowRequest(ip: string, now = Date.now()): boolean {
  const limit = Number(process.env.AGENT_RATE_LIMIT ?? 20);
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}
