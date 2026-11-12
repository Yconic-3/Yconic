import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude 연결 (설계 문서 5장 공통 AI Core).
 * 모델 이름·생각 깊이·거절 시 대체 모델·사용량 기록을 여기서 정해, 에이전트마다 따로 정하지 않게 한다.
 * 에이전트는 시스템 프롬프트·도구·대화만 넘긴다.
 */

export type ClaudeRequest = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type ClaudeMessage = Anthropic.Beta.Messages.BetaMessage;
export type ClaudeMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type ClaudeTool = Anthropic.Beta.Messages.BetaTool;
export type ClaudeContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
/** 요청에 넣는 블록 (글, 사진 …) */
export type ClaudeContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
export type ClaudeToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
export type ClaudeToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** 에이전트가 정하는 부분. 모델·대체 모델·생각 깊이는 공통 설정이 채운다 */
export type AgentRequest = Pick<ClaudeRequest, "system" | "tools" | "messages" | "max_tokens">;

/** 요청마다 바꿀 수 있는 것 */
export interface RunOptions {
  /** 생각 깊이 (기본: 설정값) */
  effort?: AiEffort;
  /** 답을 이 JSON 모양으로만 받는다 (구조화된 출력) */
  jsonSchema?: Record<string, unknown>;
  /** 오래 걸리는 요청(영상 분석)의 대기 시간 (밀리초) */
  timeoutMs?: number;
}

/** Claude를 부르는 함수. 테스트에서는 가짜로 바꿔 끼운다 */
export interface AiModel {
  readonly name: string;
  run(request: AgentRequest, options?: RunOptions): Promise<ClaudeMessage>;
}

export const DEFAULT_MODEL = "claude-opus-5-5";
export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

/** 거절(refusal)되면 같은 요청을 Anthropic이 권하는 다른 모델로 다시 돌린다 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AiSettings {
  /** API 키. 없으면 AI를 끈다 */
  apiKey: string | null;
  model: string;
  effort: AiEffort;
}

/** 환경 변수에서 AI 설정을 읽는다. ANTHROPIC_API_KEY가 없으면 apiKey는 null */
export function aiSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): AiSettings {
  const effort = env.AI_EFFORT as AiEffort | undefined;
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: env.AI_MODEL?.trim() || DEFAULT_MODEL,
    effort: effort && AI_EFFORTS.includes(effort) ? effort : "low",
  };
}

export type AiErrorCode = "AI_BUSY" | "AI_AUTH" | "AI_FAILED";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiError";
  }
}

/** SDK 오류를 세 가지로 나눈다: 잠시 뒤 다시(AI_BUSY), 키 문제(AI_AUTH), 그 밖(AI_FAILED) */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiError("AI_AUTH", "AI 서비스 인증에 실패했습니다. API 키를 확인해 주세요.", { cause: error });
  }
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return new AiError("AI_BUSY", "AI 서비스가 잠시 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.", { cause: error });
  }
  return new AiError("AI_FAILED", "AI 요청을 처리하지 못했습니다.", { cause: error });
}

export interface UsageLog {
  model: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** 거절되어 대체 모델이 답했는지 */
  servedByFallback: boolean;
}

/** 응답에서 사용량만 뽑는다. 대화 내용은 기록하지 않는다 */
export function usageOf(message: ClaudeMessage): UsageLog {
  const iterations = message.usage.iterations ?? [];
  return {
    model: message.model,
    stopReason: message.stop_reason,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    servedByFallback: iterations.some((i) => i.type === "fallback_message"),
  };
}

export interface ClaudeModelOptions {
  settings: AiSettings & { apiKey: string };
  /** 호출마다 사용량을 알린다 (기본: 콘솔에 한 줄) */
  onUsage?: (usage: UsageLog) => void;
  client?: Anthropic;
}

function logUsage(u: UsageLog) {
  console.log(
    `[ai] ${u.model} 입력 ${u.inputTokens} (캐시 ${u.cacheReadTokens}) 출력 ${u.outputTokens} 종료 ${u.stopReason}${u.servedByFallback ? " 대체 모델" : ""}`,
  );
}

/** 실제 Claude에 연결한다 */
export function createClaudeModel({ settings, onUsage = logUsage, client }: ClaudeModelOptions): AiModel {
  const anthropic = client ?? new Anthropic({ apiKey: settings.apiKey, maxRetries: 1, timeout: 60_000 });
  return {
    name: settings.model,
    async run(request, options = {}) {
      try {
        const message = await anthropic.beta.messages.create(
          {
          ...request,
          model: settings.model,
          // 생각은 늘 켜져 있고(적응형), 깊이만 정한다. 음성 대화는 빨라야 해서 기본은 low
          output_config: {
            effort: options.effort ?? settings.effort,
            ...(options.jsonSchema ? { format: { type: "json_schema" as const, schema: options.jsonSchema } } : {}),
          },
          // 도구 정의와 시스템 프롬프트는 매번 같으므로 캐시해 비용과 지연을 줄인다
          cache_control: { type: "ephemeral" },
          fallbacks: "default",
          betas: [FALLBACK_BETA],
          },
          options.timeoutMs ? { timeout: options.timeoutMs } : undefined,
        );
        onUsage(usageOf(message));
        return message;
      } catch (e) {
        throw toAiError(e);
      }
    },
  };
}
