import { describe, expect, it } from "vitest";
import type { ExerciseSegment } from "@yconic/shared-types";
import { buildBoundaries, moveBoundary, nextSegmentStart, previousSegmentStart, splitSegmentAt } from "./timeline";

function seg(id: string, startSec: number, endSec: number): ExerciseSegment {
  return {
    id,
    order: 0,
    kind: "EXERCISE",
    startSec,
    endSec,
    title: id,
    instruction: "",
    voiceGuide: "안내",
    repetitions: null,
    tts: { status: "READY", audioUrl: "x", generatedForText: "안내", failureReason: null },
  };
}

describe("경계 만들기", () => {
  it("맞닿은 구간은 경계 하나를 함께 쓴다", () => {
    const b = buildBoundaries([seg("a", 0, 10), seg("b", 10, 20)]);
    expect(b.map((x) => [x.sec, x.left, x.right])).toEqual([
      [0, null, 0],
      [10, 0, 1],
      [20, 1, null],
    ]);
  });
  it("떨어진 구간은 경계를 따로 가진다", () => {
    const b = buildBoundaries([seg("a", 0, 10), seg("b", 15, 20)]);
    expect(b.map((x) => [x.sec, x.left, x.right])).toEqual([
      [0, null, 0],
      [10, 0, null],
      [15, null, 1],
      [20, 1, null],
    ]);
  });
});

describe("경계 옮기기", () => {
  const segs = [seg("a", 0, 10), seg("b", 10, 20), seg("c", 25, 30)];
  const [, shared, bEnd, cStart] = buildBoundaries(segs);

  it("공유 경계를 옮기면 양쪽 구간이 함께 바뀐다", () => {
    const next = moveBoundary(segs, shared!, 12.34, 30);
    expect(next[0]!.endSec).toBe(12.3);
    expect(next[1]!.startSec).toBe(12.3);
  });
  it("구간이 최소 길이보다 짧아지지 않게 막는다", () => {
    const next = moveBoundary(segs, shared!, 25, 30);
    expect(next[1]!.startSec).toBe(19.5);
  });
  it("떨어진 구간의 끝은 다음 구간 시작을 넘지 못한다", () => {
    expect(moveBoundary(segs, bEnd!, 28, 30)[1]!.endSec).toBe(25);
  });
  it("떨어진 구간의 시작은 이전 구간 끝보다 앞으로 가지 못한다", () => {
    expect(moveBoundary(segs, cStart!, 5, 30)[2]!.startSec).toBe(20);
  });
});

describe("구간 나누기", () => {
  it("시각에서 둘로 나누고 뒤 구간은 음성을 새로 만들어야 한다", () => {
    let n = 0;
    const out = splitSegmentAt([seg("a", 0, 10)], 0, 4, () => `new-${n++}`)!;
    expect(out.map((s) => [s.id, s.startSec, s.endSec, s.order])).toEqual([
      ["a", 0, 4, 1],
      ["new-0", 4, 10, 2],
    ]);
    expect(out[1]!.tts.status).toBe("NONE");
  });
  it("가장자리에서는 나누지 않는다", () => {
    expect(splitSegmentAt([seg("a", 0, 10)], 0, 0.2, () => "x")).toBeNull();
  });
});

describe("구간 이동", () => {
  const segs = [seg("a", 0, 10), seg("b", 10, 20), seg("c", 20, 30)];
  it("다음 구간 시작으로 간다", () => {
    expect(nextSegmentStart(segs, 3)).toBe(10);
    expect(nextSegmentStart(segs, 25)).toBeNull();
  });
  it("구간 시작 직후면 이전 구간으로, 아니면 지금 구간 시작으로 간다", () => {
    expect(previousSegmentStart(segs, 10.5)).toBe(0);
    expect(previousSegmentStart(segs, 15)).toBe(10);
  });
});
