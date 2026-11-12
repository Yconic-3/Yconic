"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { hasNarration, type ExerciseSegment, type ExerciseSessionState } from "@yconic/shared-types";
import type { PublishedExercise } from "./api";
import { getSpeechState } from "./speech";
import { clampSegmentIndex, segmentAnnouncement, segmentIndexAt, segmentStartSec, sessionEndSec, sessionStateFor } from "./player";

const TICK_MS = 250;

export interface ExerciseSession {
  state: ExerciseSessionState;
  playing: boolean;
  started: boolean;
  /** 지금 구간 번호(0부터). 시작 전이면 0 */
  segmentIndex: number;
  positionSec: number;
  /** 시작하거나 이어서 재생한다. 처음 시작할 때는 주의사항을 먼저 읽는다. */
  start(): void;
  pause(): void;
  next(): void;
  previous(): void;
  /** 지금 구간 안내를 다시 읽는다. */
  repeat(): void;
  goToSegment(index: number): void;
  /** 위험 신호 등으로 운동을 중단한다. */
  stop(): void;
}

/**
 * 운동 한 편의 재생을 맡는다.
 * 영상이 있으면 영상의 재생 위치를, 없으면 흐르는 시간을 기준으로 삼아
 * 구간이 시작될 때마다 그 구간의 음성 안내를 `say`로 읽게 한다.
 *
 * 설계상 운동 세션 상태는 백엔드가 관리한다 (설계 문서 3장).
 * 백엔드가 준비되기 전까지만 앱 안에서 상태를 계산한다.
 */
export function useExerciseSession(
  exercise: PublishedExercise | null,
  videoRef: RefObject<HTMLVideoElement | null>,
  /** fitSec: 이 시간 안에 다 읽도록 말 속도를 맞춘다 (영상 속도에 맞추기) */
  say: (text: string, audioUrl?: string | null, opts?: { fitSec?: number }) => Promise<boolean>,
  /** 단계마다 읽어 줄 안내 (내 강의에 따라 짧게 또는 자세하게). 없으면 voiceGuide */
  guideOf: (segment: ExerciseSegment) => string = (s) => s.voiceGuide,
): ExerciseSession {
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [readingPrecautions, setReadingPrecautions] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);

  // 타이머와 음성 콜백에서 최신 값을 읽기 위한 참조
  const exerciseRef = useRef(exercise);
  exerciseRef.current = exercise;
  const sayRef = useRef(say);
  sayRef.current = say;
  const guideOfRef = useRef(guideOf);
  guideOfRef.current = guideOf;
  const positionRef = useRef(0);
  const announcedRef = useRef(-1);
  const playingRef = useRef(false);
  const lastTickRef = useRef(0);
  // 운동이 바뀌거나 처음부터 다시 시작하면 번호를 올려, 이전 흐름의 늦은 콜백을 무시한다.
  const runRef = useRef(0);

  const segments = exercise?.segments ?? [];

  const setPosition = useCallback((sec: number) => {
    positionRef.current = sec;
    setPositionSec(sec);
  }, []);

  const announce = useCallback((index: number) => {
    const ex = exerciseRef.current;
    const segment = ex?.segments[index];
    if (!ex || !segment) return;
    announcedRef.current = index;
    setSegmentIndex(index);
    // 만들어 둔 음성 파일은 자세한 안내를 읽은 것이므로, 다른 안내(짧은·맞춤)를 읽을 때는 브라우저 음성으로 읽는다.
    const guide = guideOfRef.current(segment);
    const audioUrl = guide === segment.voiceGuide ? segment.tts.audioUrl : null;
    // 강사가 말하는 영상이면 단계 이름은 붙이지 않고 맞춤 안내만, 그 단계 안에 다 읽도록 읽는다 (docs/decisions/0009).
    // 그 시간에는 영상 소리를 끄므로 강사의 말과 겹치지 않는다. 안내가 비어 있으면 말하지 않는다.
    // 말이 없는 영상(또는 영상 파일 없음)은 예전처럼 구간 이름과 안내를 읽는다.
    const narrated = hasNarration(ex.segments);
    const text = narrated ? guide.trim() : segmentAnnouncement({ title: segment.title, voiceGuide: guide }, index, ex.segments.length);
    if (!text) return;
    const fitSec = narrated ? Math.max(1, segment.endSec - Math.max(segment.startSec, positionRef.current)) : undefined;
    void sayRef.current(text, audioUrl, { fitSec });
  }, []);

  const haltClock = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    videoRef.current?.pause();
  }, [videoRef]);

  const runClock = useCallback(() => {
    playingRef.current = true;
    lastTickRef.current = Date.now();
    setPlaying(true);
    const video = videoRef.current;
    if (video) {
      video.currentTime = positionRef.current;
      void video.play().catch(() => {
        // 자동 재생이 막히면 시간만 흘려 음성 안내를 이어 간다.
      });
    }
  }, [videoRef]);

  // 운동이 바뀌면 처음 상태로 되돌린다.
  useEffect(() => {
    runRef.current++;
    playingRef.current = false;
    announcedRef.current = -1;
    positionRef.current = 0;
    setStarted(false);
    setPlaying(false);
    setReadingPrecautions(false);
    setCompleted(false);
    setStopped(false);
    setPositionSec(0);
    setSegmentIndex(0);
  }, [exercise?.id]);

  // 재생 중에는 일정 간격으로 위치를 읽어 구간이 바뀌었는지 확인한다.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const ex = exerciseRef.current;
      if (!ex || !playingRef.current) return;
      const now = Date.now();
      const video = videoRef.current;
      const usingVideo = !!video && !video.paused && !Number.isNaN(video.duration);
      const next = usingVideo ? video.currentTime : positionRef.current + (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setPosition(next);

      const end = sessionEndSec(ex.segments, ex.video.durationSec);
      if (next >= end || (usingVideo && video.ended)) {
        haltClock();
        setCompleted(true);
        void sayRef.current("운동을 마쳤습니다. 수고하셨습니다. 다른 운동을 하려면 홈으로 가기를 누르거나 홈이라고 말해 주세요.");
        return;
      }
      const index = segmentIndexAt(ex.segments, next);
      if (index >= 0 && index !== announcedRef.current) announce(index);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [playing, announce, haltClock, setPosition, videoRef]);

  // 화면을 떠날 때 재생을 멈춘다.
  useEffect(() => () => videoRef.current?.pause(), [videoRef]);

  const start = useCallback(() => {
    const ex = exerciseRef.current;
    if (!ex || playingRef.current || readingPrecautions) return;
    if (completed || stopped || !started) {
      // 처음부터: 주의사항을 먼저 읽고 영상을 시작한다.
      const run = ++runRef.current;
      announcedRef.current = -1;
      setPosition(0);
      setSegmentIndex(0);
      setCompleted(false);
      setStopped(false);
      setStarted(true);
      // 음성 안내를 껐으면(일반 사용자) 원래 영상을 바로 재생한다
      if (!getSpeechState().enabled) {
        runClock();
        return;
      }
      setReadingPrecautions(true);
      // 강사가 소개하는 영상이면 요약은 읽지 않는다 (영상 내용을 되풀이하지 않게)
      const summary = hasNarration(ex.segments) ? "" : ex.summary;
      const intro = [`${ex.title}.`, summary, ex.precautions.length ? `운동 전 주의사항입니다. ${ex.precautions.join(" ")}` : "", "이제 시작합니다."]
        .filter(Boolean)
        .join(" ");
      void sayRef.current(intro).then(() => {
        if (run !== runRef.current) return;
        setReadingPrecautions(false);
        runClock();
      });
      return;
    }
    // 멈춘 곳에서 이어서: 지금 구간 안내를 다시 들려주고 재생한다.
    runClock();
    announce(Math.max(0, segmentIndexAt(ex.segments, positionRef.current)));
  }, [announce, completed, readingPrecautions, runClock, setPosition, started, stopped]);

  const pause = useCallback(() => {
    if (readingPrecautions) {
      // 주의사항을 읽는 중에 멈추면 시작 전으로 돌아간다.
      runRef.current++;
      setReadingPrecautions(false);
      setStarted(false);
    }
    haltClock();
  }, [haltClock, readingPrecautions]);

  const goToSegment = useCallback(
    (index: number) => {
      const ex = exerciseRef.current;
      if (!ex || ex.segments.length === 0) return;
      const target = clampSegmentIndex(ex.segments, index);
      const sec = segmentStartSec(ex.segments, target);
      // 시작 직후 주의사항을 읽는 중에 단계를 옮기면, 낭독을 끊고 그 단계부터 바로 재생한다.
      const skippingIntro = readingPrecautions;
      if (skippingIntro) {
        runRef.current++;
        setReadingPrecautions(false);
      }
      setStarted(true);
      setCompleted(false);
      setStopped(false);
      setPosition(sec);
      lastTickRef.current = Date.now();
      const video = videoRef.current;
      if (video) video.currentTime = sec;
      if (skippingIntro) runClock();
      announce(target);
    },
    [announce, readingPrecautions, runClock, setPosition, videoRef],
  );

  const stop = useCallback(() => {
    runRef.current++;
    setReadingPrecautions(false);
    haltClock();
    setStopped(true);
  }, [haltClock]);

  const current = segments[segmentIndex] ?? null;
  return {
    state: sessionStateFor({ started, playing, readingPrecautions, completed, stopped, kind: current?.kind ?? null }),
    playing: playing || readingPrecautions,
    started,
    segmentIndex,
    positionSec,
    start,
    pause,
    next: () => goToSegment(segmentIndex + 1),
    previous: () => goToSegment(segmentIndex - 1),
    repeat: () => goToSegment(segmentIndex),
    goToSegment,
    stop,
  };
}
