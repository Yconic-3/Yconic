import { describe, expect, it } from "vitest";
import {
  availableActions,
  canEditContent,
  canPerformAction,
  findVisualOnlyPhrases,
  hasBlockingIssues,
  hasPermission,
  isVisibleToUsers,
  validateExerciseContent,
  type ExerciseStep,
} from "./index";

function step(overrides: Partial<ExerciseStep> = {}): ExerciseStep {
  const voiceGuide = overrides.voiceGuide ?? "두 발을 어깨너비로 벌리고 천천히 숨을 들이마십니다.";
  return {
    id: "s1",
    order: 1,
    title: "준비 자세",
    instruction: "발을 어깨너비로 벌린다",
    voiceGuide,
    durationSec: 30,
    repetitions: null,
    restAfterSec: 10,
    tts: { status: "READY", audioUrl: "x.mp3", generatedForText: voiceGuide, failureReason: null },
    ...overrides,
  };
}

const base = {
  title: "목 스트레칭",
  summary: "앉아서 하는 목 스트레칭",
  precautions: ["통증이 있으면 즉시 멈추세요."],
  steps: [step()],
};

describe("권한", () => {
  it("편집자는 승인·공개 권한이 없다", () => {
    expect(hasPermission("EDITOR", "content:edit")).toBe(true);
    expect(hasPermission("EDITOR", "content:review")).toBe(false);
    expect(hasPermission("EDITOR", "content:publish")).toBe(false);
  });
  it("조회자는 작업을 만들 수 없다", () => {
    expect(hasPermission("VIEWER", "job:create")).toBe(false);
  });
  it("최고 관리자만 감사 로그를 본다", () => {
    expect(hasPermission("APPROVER", "audit:read")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "audit:read")).toBe(true);
  });
});

describe("상태 전이", () => {
  it("편집자는 초안을 검수 요청할 수 있지만 승인은 못 한다", () => {
    expect(availableActions("EDITOR", "DRAFT")).toEqual(["SUBMIT_FOR_REVIEW", "ARCHIVE"]);
    expect(canPerformAction("EDITOR", "IN_REVIEW", "APPROVE")).toBe(false);
  });
  it("승인권자는 검수 중 콘텐츠를 승인하거나 수정 요청할 수 있다", () => {
    expect(availableActions("APPROVER", "IN_REVIEW")).toEqual(["REQUEST_CHANGES", "APPROVE"]);
  });
  it("검수 중에 바로 공개할 수 없다", () => {
    expect(canPerformAction("SUPER_ADMIN", "IN_REVIEW", "PUBLISH")).toBe(false);
  });
  it("검수 중·공개 중에는 내용을 고칠 수 없다", () => {
    expect(canEditContent("EDITOR", "DRAFT")).toBe(true);
    expect(canEditContent("EDITOR", "IN_REVIEW")).toBe(false);
    expect(canEditContent("SUPER_ADMIN", "PUBLISHED")).toBe(false);
  });
  it("공개 중인 콘텐츠만 사용자에게 보인다", () => {
    expect(isVisibleToUsers({ status: "PUBLISHED" })).toBe(true);
    expect(isVisibleToUsers({ status: "APPROVED" })).toBe(false);
  });
});

describe("콘텐츠 검사", () => {
  it("정상 콘텐츠는 문제가 없다", () => {
    expect(validateExerciseContent(base)).toEqual([]);
  });
  it("단계가 없으면 검수 요청을 막는다", () => {
    const issues = validateExerciseContent({ ...base, steps: [] });
    expect(hasBlockingIssues(issues)).toBe(true);
  });
  it("음성 안내문이 비어 있으면 오류다", () => {
    const issues = validateExerciseContent({ ...base, steps: [step({ voiceGuide: " " })] });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "ERROR", field: "steps.0.voiceGuide" }));
  });
  it("시각 의존 표현은 경고한다", () => {
    const text = "화면처럼 팔을 이렇게 올립니다.";
    const issues = validateExerciseContent({
      ...base,
      steps: [step({ voiceGuide: text, tts: { status: "READY", audioUrl: null, generatedForText: text, failureReason: null } })],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("WARNING");
    expect(issues[0]?.message).toContain('"이렇게"');
  });
  it("'해 보세요' 같은 일반 표현은 경고하지 않는다", () => {
    expect(findVisualOnlyPhrases("천천히 숨을 내쉬어 보세요.")).toEqual([]);
  });
  it("안내문이 바뀌면 음성 재생성을 경고한다", () => {
    const s = step();
    const issues = validateExerciseContent({ ...base, steps: [{ ...s, voiceGuide: s.voiceGuide + " 바뀜" }] });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "WARNING", field: "steps.0.tts" }));
  });
  it("주의사항이 없으면 경고만 하고 막지는 않는다", () => {
    const issues = validateExerciseContent({ ...base, precautions: [] });
    expect(hasBlockingIssues(issues)).toBe(false);
    expect(issues).toHaveLength(1);
  });
  it("잘못된 시간·횟수는 오류다", () => {
    const issues = validateExerciseContent({ ...base, steps: [step({ durationSec: 0, repetitions: 1.5, restAfterSec: -1 })] });
    expect(issues.filter((i) => i.severity === "ERROR").map((i) => i.field)).toEqual([
      "steps.0.durationSec",
      "steps.0.repetitions",
      "steps.0.restAfterSec",
    ]);
  });
});
