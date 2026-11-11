import { describe, expect, it } from "vitest";
import { clampSegmentIndex, formatDuration, segmentAnnouncement, segmentIndexAt, segmentStartSec, sessionEndSec, sessionStateFor } from "./player";

const segments = [
  { startSec: 0, endSec: 10 },
  { startSec: 10, endSec: 40 },
  { startSec: 45, endSec: 60 },
];

describe("segmentIndexAt", () => {
  it("시각이 속한 구간을 찾는다", () => {
    expect(segmentIndexAt(segments, 0)).toBe(0);
    expect(segmentIndexAt(segments, 9.9)).toBe(0);
    expect(segmentIndexAt(segments, 10)).toBe(1);
    expect(segmentIndexAt(segments, 59)).toBe(2);
  });

  it("구간 사이의 빈 시간에는 직전 구간으로 본다", () => {
    expect(segmentIndexAt(segments, 42)).toBe(1);
  });

  it("첫 구간이 시작되기 전이면 -1", () => {
    expect(segmentIndexAt([{ startSec: 5, endSec: 10 }], 2)).toBe(-1);
    expect(segmentIndexAt([], 2)).toBe(-1);
  });
});

describe("구간 이동", () => {
  it("범위를 벗어나면 처음과 끝에서 멈춘다", () => {
    expect(clampSegmentIndex(segments, -1)).toBe(0);
    expect(clampSegmentIndex(segments, 5)).toBe(2);
    expect(clampSegmentIndex([], 0)).toBe(-1);
  });

  it("구간의 시작 시각으로 옮긴다", () => {
    expect(segmentStartSec(segments, 2)).toBe(45);
    expect(segmentStartSec(segments, 9)).toBe(45);
    expect(segmentStartSec([], 0)).toBe(0);
  });

  it("끝나는 시각은 영상 길이와 마지막 구간 끝 중 큰 값", () => {
    expect(sessionEndSec(segments, 75)).toBe(75);
    expect(sessionEndSec(segments, 50)).toBe(60);
  });
});

describe("sessionStateFor", () => {
  const base = { started: true, playing: true, readingPrecautions: false, completed: false, stopped: false, kind: "EXERCISE" as const };

  it("공통 타입의 세션 상태로 바꾼다", () => {
    expect(sessionStateFor({ ...base, started: false, playing: false })).toBe("READY");
    expect(sessionStateFor({ ...base, readingPrecautions: true })).toBe("INTRO");
    expect(sessionStateFor({ ...base, kind: "INTRO" })).toBe("PREPARATION");
    expect(sessionStateFor(base)).toBe("IN_PROGRESS");
    expect(sessionStateFor({ ...base, kind: "REST" })).toBe("REST");
    expect(sessionStateFor({ ...base, playing: false })).toBe("PAUSED");
    expect(sessionStateFor({ ...base, playing: false, completed: true })).toBe("COMPLETED");
  });

  it("중단은 다른 상태보다 먼저다", () => {
    expect(sessionStateFor({ ...base, stopped: true, completed: true })).toBe("STOPPED");
  });
});

describe("안내 문구", () => {
  it("몇 단계인지와 구간 이름, 음성 안내를 읽는다", () => {
    expect(segmentAnnouncement({ title: "준비 자세", voiceGuide: "의자에 앉습니다." }, 0, 4)).toBe("4단계 중 1단계, 준비 자세. 의자에 앉습니다.");
  });

  it("음성 안내가 없는 구간은 이름만 읽는다", () => {
    expect(segmentAnnouncement({ title: "휴식", voiceGuide: "" }, 2, 4)).toBe("4단계 중 3단계, 휴식.");
  });

  it("길이를 말로 읽기 좋게 바꾼다", () => {
    expect(formatDuration(45)).toBe("45초");
    expect(formatDuration(120)).toBe("2분");
    expect(formatDuration(75)).toBe("1분 15초");
  });
});
