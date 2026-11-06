import type { ExerciseContent } from "./exercise";

export type IssueSeverity = "ERROR" | "WARNING";

export interface ContentIssue {
  severity: IssueSeverity;
  /** 문제가 있는 위치. 단계 문제면 "steps.2.voiceGuide" 형식 */
  field: string;
  message: string;
}

/**
 * 시각장애인에게 의미가 전달되지 않는 시각 의존 표현.
 * "이렇게", "저기"처럼 화면을 봐야 이해되는 말은 음성 안내에 쓰지 않는다.
 */
export const VISUAL_ONLY_PHRASES = [
  "이렇게",
  "저렇게",
  "여기",
  "저기",
  "화면",
  "보이는",
  "보시는",
  "그림",
  "영상처럼",
] as const;

export const VOICE_GUIDE_MAX_LENGTH = 300;

export function findVisualOnlyPhrases(text: string): string[] {
  return VISUAL_ONLY_PHRASES.filter((p) => text.includes(p));
}

/**
 * 콘텐츠 누락·형식 오류 검사. ERROR가 하나라도 있으면 검수 요청을 할 수 없다.
 * WARNING은 검수자가 판단하도록 표시만 한다.
 */
export function validateExerciseContent(
  content: Pick<ExerciseContent, "title" | "summary" | "precautions" | "steps">,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const err = (field: string, message: string) => issues.push({ severity: "ERROR", field, message });
  const warn = (field: string, message: string) => issues.push({ severity: "WARNING", field, message });

  if (!content.title.trim()) err("title", "제목을 입력해야 합니다.");
  if (!content.summary.trim()) err("summary", "운동 요약을 입력해야 합니다.");
  if (content.precautions.filter((p) => p.trim()).length === 0) {
    warn("precautions", "주의사항이 없습니다. 통증이나 어지럼이 있으면 중단하라는 안내를 넣는 것을 권장합니다.");
  }
  if (content.steps.length === 0) err("steps", "운동 단계가 최소 1개 있어야 합니다.");

  content.steps.forEach((step, i) => {
    const n = i + 1;
    const at = (f: string) => `steps.${i}.${f}`;
    if (!step.title.trim()) err(at("title"), `${n}단계 제목을 입력해야 합니다.`);
    if (!step.voiceGuide.trim()) {
      err(at("voiceGuide"), `${n}단계 음성 안내문을 입력해야 합니다.`);
    } else {
      if (step.voiceGuide.length > VOICE_GUIDE_MAX_LENGTH) {
        warn(at("voiceGuide"), `${n}단계 음성 안내문이 ${VOICE_GUIDE_MAX_LENGTH}자를 넘습니다. 더 짧게 나누는 것을 권장합니다.`);
      }
      const visual = findVisualOnlyPhrases(step.voiceGuide);
      if (visual.length > 0) {
        warn(at("voiceGuide"), `${n}단계 음성 안내문에 시각 의존 표현이 있습니다: ${visual.map((v) => `"${v}"`).join(", ")}`);
      }
      if (step.tts.status !== "READY") {
        warn(at("tts"), `${n}단계 음성 파일이 아직 준비되지 않았습니다.`);
      } else if (step.tts.generatedForText !== step.voiceGuide) {
        warn(at("tts"), `${n}단계 안내문이 바뀌어 음성 파일을 다시 생성해야 합니다.`);
      }
    }
    if (!Number.isFinite(step.durationSec) || step.durationSec <= 0) {
      err(at("durationSec"), `${n}단계 운동 시간은 1초 이상이어야 합니다.`);
    }
    if (step.repetitions !== null && (!Number.isInteger(step.repetitions) || step.repetitions <= 0)) {
      err(at("repetitions"), `${n}단계 반복 횟수는 1 이상의 정수여야 합니다.`);
    }
    if (!Number.isFinite(step.restAfterSec) || step.restAfterSec < 0) {
      err(at("restAfterSec"), `${n}단계 휴식 시간은 0초 이상이어야 합니다.`);
    }
  });

  return issues;
}

export function hasBlockingIssues(issues: ContentIssue[]): boolean {
  return issues.some((i) => i.severity === "ERROR");
}
