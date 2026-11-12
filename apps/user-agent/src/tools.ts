import type { ClaudeTool } from "@yconic/ai-common";
import {
  AGENT_PLAYBACK_COMMANDS,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  matchesExerciseFilter,
  SEGMENT_KIND_LABELS,
  segmentDurationSec,
  type AgentAction,
  type AgentAppContext,
  type AgentPlaybackCommand,
  type ExerciseCategory,
  type PublishedExercise,
} from "@yconic/shared-types";
import type { Backend } from "./backend";

/**
 * 사용자 에이전트의 도구 (설계 문서 6장 "사용자용 도구 예시" 중 지금 백엔드가 가진 것).
 * - 정보 도구: 공개 운동 찾기·자세히 보기. 백엔드 사용자 API만 부른다.
 * - 화면 도구: 운동 열기·재생 조작·말 속도·화면 이동. 에이전트가 직접 실행하지 않고 할 일(AgentAction)로 모아
 *   화면에 돌려준다. 운동 진행 상태는 화면이 관리한다.
 */

const CATEGORY_CHOICES = [...EXERCISE_CATEGORIES, "ALL"] as const;
const SEARCH_LIMIT = 10;

export const USER_AGENT_TOOLS: ClaudeTool[] = [
  {
    name: "search_exercises",
    description:
      "공개된 운동을 분류와 낱말로 찾는다. 사용자가 어떤 운동이 있는지 묻거나 운동을 찾거나 추천해 달라고 할 때 부른다. " +
      "show_on_screen이 true면 처음 화면의 운동 목록도 이 조건으로 거른다 (운동을 찾아 달라는 말이면 true, 단순한 질문이면 false).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [...CATEGORY_CHOICES],
          description: `분류. ${EXERCISE_CATEGORIES.map((c) => `${c}=${EXERCISE_CATEGORY_LABELS[c]}`).join(", ")}, ALL=전체`,
        },
        keyword: { type: "string", description: "제목·요약·태그에서 찾을 짧은 낱말 하나 (예: 하체, 무릎, 어깨). 없으면 빈 문자열" },
        show_on_screen: { type: "boolean" },
      },
      required: ["category", "keyword", "show_on_screen"],
      additionalProperties: false,
    },
  },
  {
    name: "get_exercise_detail",
    description: "운동 하나의 요약, 주의사항, 단계별 음성 안내를 본다. 운동 방법이나 주의사항, 몇 단계인지 같은 질문에 답하기 전에 부른다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { exercise_id: { type: "string", description: "공개 운동 목록의 id" } },
      required: ["exercise_id"],
      additionalProperties: false,
    },
  },
  {
    name: "open_exercise",
    description:
      "운동 화면을 연다. 사용자가 특정 운동을 하겠다거나 보여 달라고 할 때 부른다. " +
      "바로 시작하자는 말(예: '스쿼트 시작', '그거 할래')이면 autoplay를 true로 한다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        exercise_id: { type: "string", description: "공개 운동 목록의 id" },
        autoplay: { type: "boolean" },
      },
      required: ["exercise_id", "autoplay"],
      additionalProperties: false,
    },
  },
  {
    name: "control_playback",
    description:
      "운동 화면에서 안내를 조작한다. START 시작·이어서, PAUSE 멈춤, NEXT 다음 단계, PREVIOUS 이전 단계, REPEAT 지금 안내 다시. " +
      "STOP은 통증·어지럼·숨참 같은 위험 신호가 있을 때 운동을 중단한다 (어느 화면에서나 쓸 수 있다).",
    strict: true,
    input_schema: {
      type: "object",
      properties: { command: { type: "string", enum: [...AGENT_PLAYBACK_COMMANDS] } },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    name: "change_speech_rate",
    description: "읽어 주는 말의 속도를 한 단계 바꾼다.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { direction: { type: "string", enum: ["SLOWER", "FASTER"] } },
      required: ["direction"],
      additionalProperties: false,
    },
  },
  {
    name: "go_to",
    description: "화면을 옮긴다. HOME 처음 화면, BACK 이전 화면.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { destination: { type: "string", enum: ["HOME", "BACK"] } },
      required: ["destination"],
      additionalProperties: false,
    },
  },
];

export interface ToolContext {
  backend: Backend;
  context: AgentAppContext;
  /** 화면 도구가 여기에 할 일을 쌓는다 */
  actions: AgentAction[];
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

const ok = (value: unknown): ToolOutcome => ({ content: JSON.stringify(value), isError: false });
const fail = (message: string): ToolOutcome => ({ content: message, isError: true });

type Input = Record<string, unknown>;

function oneOf<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === "string" && (choices as readonly string[]).includes(value) ? (value as T) : null;
}

function minutes(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 1 ? `약 ${m}분` : `${Math.round(sec)}초`;
}

/** 목록에 보여 줄 짧은 정보 */
export function exerciseBrief(e: PublishedExercise) {
  return {
    id: e.id,
    title: e.title,
    category: EXERCISE_CATEGORY_LABELS[e.category],
    difficulty: DIFFICULTY_LABELS[e.difficulty],
    length: minutes(e.video.durationSec),
    tags: e.tags,
    summary: e.summary,
  };
}

function exerciseDetail(e: PublishedExercise) {
  return {
    ...exerciseBrief(e),
    precautions: e.precautions,
    steps: e.segments.map((s) => ({
      order: s.order,
      kind: SEGMENT_KIND_LABELS[s.kind],
      title: s.title,
      length: minutes(segmentDurationSec(s)),
      repetitions: s.repetitions,
      voiceGuide: s.voiceGuide,
    })),
  };
}

async function findExercise(backend: Backend, id: unknown): Promise<PublishedExercise | null> {
  if (typeof id !== "string") return null;
  return (await backend.listExercises()).find((e) => e.id === id) ?? null;
}

const NOT_PUBLISHED = "그 id의 공개 운동이 없습니다. 공개 운동 목록이나 search_exercises 결과의 id만 쓰세요.";

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const input: Input = rawInput && typeof rawInput === "object" ? (rawInput as Input) : {};

  switch (name) {
    case "search_exercises": {
      const choice = oneOf(input.category, CATEGORY_CHOICES);
      if (!choice) return fail("category가 올바르지 않습니다.");
      const category: ExerciseCategory | null = choice === "ALL" ? null : choice;
      const keyword = typeof input.keyword === "string" && input.keyword.trim() ? input.keyword.trim().slice(0, 30) : null;
      const found = (await ctx.backend.listExercises()).filter((e) =>
        matchesExerciseFilter(e, { category: category ?? undefined, keyword: keyword ?? undefined }),
      );
      if (input.show_on_screen === true) ctx.actions.push({ type: "SHOW_LIST", category, keyword });
      return ok({ total: found.length, exercises: found.slice(0, SEARCH_LIMIT).map(exerciseBrief) });
    }

    case "get_exercise_detail": {
      const e = await findExercise(ctx.backend, input.exercise_id);
      return e ? ok(exerciseDetail(e)) : fail(NOT_PUBLISHED);
    }

    case "open_exercise": {
      const e = await findExercise(ctx.backend, input.exercise_id);
      if (!e) return fail(NOT_PUBLISHED);
      const autoplay = input.autoplay === true;
      ctx.actions.push({ type: "OPEN_EXERCISE", exerciseId: e.id, autoplay });
      return ok({ opened: e.title, autoplay });
    }

    case "control_playback": {
      const command = oneOf<AgentPlaybackCommand>(input.command, AGENT_PLAYBACK_COMMANDS);
      if (!command) return fail("command가 올바르지 않습니다.");
      const onExercise =
        ctx.context.screen === "exercise" || ctx.actions.some((a) => a.type === "OPEN_EXERCISE");
      if (command !== "STOP" && !onExercise) {
        return fail("지금은 운동 화면이 아닙니다. 먼저 open_exercise로 운동을 여세요 (바로 시작하려면 autoplay true).");
      }
      ctx.actions.push({ type: "PLAYBACK", command });
      return ok({ done: command });
    }

    case "change_speech_rate": {
      const direction = oneOf(input.direction, ["SLOWER", "FASTER"] as const);
      if (!direction) return fail("direction이 올바르지 않습니다.");
      ctx.actions.push({ type: "SPEECH_RATE", direction });
      return ok({ done: direction });
    }

    case "go_to": {
      const destination = oneOf(input.destination, ["HOME", "BACK"] as const);
      if (!destination) return fail("destination이 올바르지 않습니다.");
      ctx.actions.push({ type: "NAVIGATE", destination });
      return ok({ done: destination });
    }

    default:
      return fail(`모르는 도구입니다: ${name}`);
  }
}
