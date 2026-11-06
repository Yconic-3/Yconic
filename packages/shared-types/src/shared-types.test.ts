import { describe, expect, it } from "vitest";
import {
  availableActions,
  canEditContent,
  canPerformAction,
  estimateSpeechSec,
  findVisualOnlyPhrases,
  hasBlockingIssues,
  hasPermission,
  isVisibleToUsers,
  SELF_APPROVAL_MESSAGE,
  selfApprovalBlockedReason,
  validateExerciseContent,
  type ExerciseSegment,
} from "./index";

function segment(overrides: Partial<ExerciseSegment> = {}): ExerciseSegment {
  const voiceGuide = overrides.voiceGuide ?? "두 발을 어깨너비로 벌리고 천천히 숨을 들이마십니다.";
  return {
    id: "s1",
    order: 1,
    kind: "EXERCISE",
    startSec: 0,
    endSec: 30,
    title: "준비 자세",
    instruction: "발을 어깨너비로 벌린다",
    voiceGuide,
    repetitions: null,
    tts: { status: "READY", audioUrl: "x.mp3", generatedForText: voiceGuide, failureReason: null },
    ...overrides,
  };
}

const base = {
  title: "목 스트레칭",
  summary: "앉아서 하는 목 스트레칭",
  precautions: ["통증이 있으면 즉시 멈추세요."],
  video: { durationSec: 40 },
  segments: [segment()],
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
  it("만든 사람과 검수 요청한 사람은 승인할 수 없다", () => {
    const content = { createdBy: "u-a", submittedBy: "u-b" };
    expect(selfApprovalBlockedReason("u-a", "APPROVE", content)).toBe(SELF_APPROVAL_MESSAGE);
    expect(selfApprovalBlockedReason("u-b", "APPROVE", content)).toBe(SELF_APPROVAL_MESSAGE);
    expect(selfApprovalBlockedReason("u-c", "APPROVE", content)).toBeNull();
    // 수정 요청이나 공개는 막지 않는다
    expect(selfApprovalBlockedReason("u-a", "REQUEST_CHANGES", content)).toBeNull();
    expect(selfApprovalBlockedReason("u-a", "PUBLISH", content)).toBeNull();
    expect(selfApprovalBlockedReason("u-a", "APPROVE", { createdBy: "u-x", submittedBy: null })).toBeNull();
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
  it("구간이 없으면 검수 요청을 막는다", () => {
    const issues = validateExerciseContent({ ...base, segments: [] });
    expect(hasBlockingIssues(issues)).toBe(true);
  });
  it("음성 안내문이 비어 있으면 오류다", () => {
    const issues = validateExerciseContent({ ...base, segments: [segment({ voiceGuide: " " })] });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "ERROR", field: "segments.0.voiceGuide" }));
  });
  it("구간이 영상 길이를 넘거나 서로 겹치면 오류다", () => {
    const issues = validateExerciseContent({
      ...base,
      segments: [segment({ id: "a", startSec: 0, endSec: 40 }), segment({ id: "b", order: 2, startSec: 30, endSec: 70 })],
    });
    const fields = issues.filter((i) => i.severity === "ERROR").map((i) => i.field);
    expect(fields).toEqual(["segments.1.endSec", "segments.1.startSec"]);
  });
  it("구간 순서가 시작 시각 순서와 다르면 오류다", () => {
    const issues = validateExerciseContent({
      ...base,
      segments: [segment({ id: "a", startSec: 30, endSec: 40 }), segment({ id: "b", order: 2, startSec: 0, endSec: 20 })],
    });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "ERROR", field: "segments" }));
  });
  it("안내문이 구간보다 길면 경고한다", () => {
    const long = "숨을 천천히 들이마시고 내쉬면서 오른쪽 귀를 오른쪽 어깨 쪽으로 기울이고 다시 돌아옵니다.".repeat(2);
    expect(estimateSpeechSec(long)).toBeGreaterThan(10);
    const issues = validateExerciseContent({
      ...base,
      segments: [segment({ startSec: 0, endSec: 10, voiceGuide: long, tts: { status: "READY", audioUrl: null, generatedForText: long, failureReason: null } })],
    });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "WARNING", field: "segments.0.voiceGuide" }));
    expect(hasBlockingIssues(issues)).toBe(false);
  });
  it("시각 의존 표현은 경고한다", () => {
    const text = "화면처럼 팔을 이렇게 올립니다.";
    const issues = validateExerciseContent({
      ...base,
      segments: [segment({ voiceGuide: text, tts: { status: "READY", audioUrl: null, generatedForText: text, failureReason: null } })],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('"이렇게"');
  });
  it("'해 보세요' 같은 일반 표현은 경고하지 않는다", () => {
    expect(findVisualOnlyPhrases("천천히 숨을 내쉬어 보세요.")).toEqual([]);
  });
  it("안내문이 바뀌면 음성 재생성을 경고한다", () => {
    const s = segment();
    const issues = validateExerciseContent({ ...base, segments: [{ ...s, voiceGuide: s.voiceGuide + " 바뀜" }] });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "WARNING", field: "segments.0.tts" }));
  });
  it("마지막 구간 뒤에 영상이 많이 남으면 경고한다", () => {
    const issues = validateExerciseContent({ ...base, video: { durationSec: 120 } });
    expect(issues).toContainEqual(expect.objectContaining({ severity: "WARNING", field: "segments" }));
  });
  it("주의사항이 없으면 경고만 하고 막지는 않는다", () => {
    const issues = validateExerciseContent({ ...base, precautions: [] });
    expect(hasBlockingIssues(issues)).toBe(false);
    expect(issues).toHaveLength(1);
  });
});
