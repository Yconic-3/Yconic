import { segmentDurationSec, type ExerciseContent, type ExerciseSegment } from "./exercise";

export type IssueSeverity = "ERROR" | "WARNING";

export interface ContentIssue {
  severity: IssueSeverity;
  /** 문제가 있는 위치. 구간 문제면 "segments.2.voiceGuide" 형식 */
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

/** 한국어 안내 음성의 대략적인 속도. 음성 길이가 구간 길이를 넘는지 가늠하는 데 쓴다. */
export const SPEECH_CHARS_PER_SEC = 4;

export function estimateSpeechSec(text: string): number {
  return Math.ceil(text.trim().length / SPEECH_CHARS_PER_SEC);
}

export function findVisualOnlyPhrases(text: string): string[] {
  return VISUAL_ONLY_PHRASES.filter((p) => text.includes(p));
}

export function isTtsStale(s: Pick<ExerciseSegment, "voiceGuide" | "tts">): boolean {
  return s.tts.status === "READY" && s.tts.generatedForText !== s.voiceGuide;
}

type ValidatableContent = Pick<ExerciseContent, "title" | "summary" | "precautions" | "segments"> & {
  video: Pick<ExerciseContent["video"], "durationSec">;
};

/**
 * 콘텐츠 누락·형식 오류 검사. ERROR가 하나라도 있으면 검수 요청을 할 수 없다.
 * WARNING은 검수자가 판단하도록 표시만 한다.
 */
export function validateExerciseContent(content: ValidatableContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const err = (field: string, message: string) => issues.push({ severity: "ERROR", field, message });
  const warn = (field: string, message: string) => issues.push({ severity: "WARNING", field, message });
  const duration = content.video.durationSec;

  if (!content.title.trim()) err("title", "제목을 입력해야 합니다.");
  if (!content.summary.trim()) err("summary", "운동 요약을 입력해야 합니다.");
  if (!(duration > 0)) err("video", "영상 길이 정보가 없습니다. 영상을 다시 올려 주세요.");
  if (content.precautions.filter((p) => p.trim()).length === 0) {
    warn("precautions", "주의사항이 없습니다. 통증이나 어지럼이 있으면 중단하라는 안내를 넣는 것을 권장합니다.");
  }
  if (content.segments.length === 0) err("segments", "구간이 최소 1개 있어야 합니다.");

  const sorted = [...content.segments].sort((a, b) => a.startSec - b.startSec);
  if (sorted.some((s, i) => s.id !== content.segments[i]?.id)) {
    err("segments", "구간 순서가 시작 시각 순서와 다릅니다. 구간을 시작 시각 순으로 정렬해 주세요.");
  }

  content.segments.forEach((seg, i) => {
    const n = i + 1;
    const at = (f: string) => `segments.${i}.${f}`;
    const len = segmentDurationSec(seg);

    if (!seg.title.trim()) err(at("title"), `${n}구간 제목을 입력해야 합니다.`);
    if (!Number.isFinite(seg.startSec) || seg.startSec < 0) err(at("startSec"), `${n}구간 시작 시각이 잘못되었습니다.`);
    if (!Number.isFinite(seg.endSec) || seg.endSec <= seg.startSec) {
      err(at("endSec"), `${n}구간 끝 시각은 시작 시각보다 커야 합니다.`);
    } else if (duration > 0 && seg.endSec > duration + 0.05) {
      err(at("endSec"), `${n}구간 끝 시각이 영상 길이를 넘습니다.`);
    }
    const prev = content.segments[i - 1];
    if (prev && seg.startSec < prev.endSec - 0.05) {
      err(at("startSec"), `${n}구간이 ${i}구간과 겹칩니다.`);
    }
    if (seg.repetitions !== null && (!Number.isInteger(seg.repetitions) || seg.repetitions <= 0)) {
      err(at("repetitions"), `${n}구간 반복 횟수는 1 이상의 정수여야 합니다.`);
    }

    if (!seg.voiceGuide.trim()) {
      err(at("voiceGuide"), `${n}구간 음성 안내문을 입력해야 합니다.`);
    } else {
      if (seg.voiceGuide.length > VOICE_GUIDE_MAX_LENGTH) {
        warn(at("voiceGuide"), `${n}구간 음성 안내문이 ${VOICE_GUIDE_MAX_LENGTH}자를 넘습니다. 더 짧게 나누는 것을 권장합니다.`);
      }
      const speech = estimateSpeechSec(seg.voiceGuide);
      if (len > 0 && speech > len) {
        warn(at("voiceGuide"), `${n}구간 안내문을 읽는 데 약 ${speech}초가 걸려 구간 길이 ${Math.round(len)}초를 넘습니다. 안내문을 줄이거나 구간을 늘려 주세요.`);
      }
      const visual = findVisualOnlyPhrases(seg.voiceGuide);
      if (visual.length > 0) {
        warn(at("voiceGuide"), `${n}구간 음성 안내문에 시각 의존 표현이 있습니다: ${visual.map((v) => `"${v}"`).join(", ")}`);
      }
      if (seg.tts.status !== "READY") {
        warn(at("tts"), `${n}구간 음성 파일이 아직 준비되지 않았습니다.`);
      } else if (isTtsStale(seg)) {
        warn(at("tts"), `${n}구간 안내문이 바뀌어 음성 파일을 다시 생성해야 합니다.`);
      }
    }
  });

  const last = content.segments[content.segments.length - 1];
  if (last && duration > 0 && duration - last.endSec > 15) {
    warn("segments", `마지막 구간 뒤에 안내가 없는 영상이 ${Math.round(duration - last.endSec)}초 남아 있습니다.`);
  }

  return issues;
}

export function hasBlockingIssues(issues: ContentIssue[]): boolean {
  return issues.some((i) => i.severity === "ERROR");
}
