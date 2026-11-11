"use client";

import { SEGMENT_KIND_LABELS, type ExerciseSegment, type SegmentKind } from "@yconic/shared-types";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { boundaryLimits, buildBoundaries, moveBoundary, type Boundary } from "@/admin/lib/timeline";
import { formatTimecode } from "@/admin/lib/video";

export interface VideoPlayerHandle {
  seek(sec: number): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  getCurrentTime(): number;
  isPlaying(): boolean;
}

export type PlayStateReason = "play" | "pause" | "ended";

interface Props {
  src: string | null;
  /** 재생 주소를 아직 불러오는 중인지 */
  loadingSrc: boolean;
  durationSec: number;
  segments: ExerciseSegment[];
  activeSegmentId: string | null;
  /** 부모가 들고 있는 현재 시각 (표시용) */
  currentTime: number;
  onTimeUpdate(sec: number): void;
  onPlayStateChange(playing: boolean, reason: PlayStateReason): void;
  onSegmentClick(segment: ExerciseSegment): void;
  /** 화면을 가려 시각장애인 사용자처럼 소리만 듣는다 */
  blackout?: boolean;
  /** 타임라인에서 구간 경계를 끌어 조절할 수 있는지 */
  editable?: boolean;
  onSegmentsChange?(next: ExerciseSegment[]): void;
}

export const SEGMENT_COLORS: Record<SegmentKind, string> = {
  INTRO: "bg-slate-500",
  EXERCISE: "bg-blue-600",
  REST: "bg-emerald-600",
  OUTRO: "bg-slate-500",
};

/**
 * 영상 플레이어 + 구간 타임라인.
 * 영상 파일이 없으면(예시 데이터) 시간만 흐르는 가상 재생으로 구간 안내를 확인할 수 있다.
 */
export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  { src, loadingSrc, durationSec, segments, activeSegmentId, currentTime, onTimeUpdate, onPlayStateChange, onSegmentClick, blackout, editable, onSegmentsChange },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const total = durationSec > 0 ? durationSec : 1;

  // 콜백은 ref로 들고 있어 가상 재생 타이머가 항상 최신 함수를 부른다.
  const onTimeRef = useRef(onTimeUpdate);
  const onStateRef = useRef(onPlayStateChange);
  onTimeRef.current = onTimeUpdate;
  onStateRef.current = onPlayStateChange;

  // 가상 재생 (영상 파일이 없을 때)
  const sim = useRef({ playing: false, base: 0, startedAt: 0 });
  const [simPlaying, setSimPlaying] = useState(false);
  const timeRef = useRef(0);

  const emitTime = useCallback((t: number) => {
    timeRef.current = t;
    onTimeRef.current(t);
  }, []);

  const simStop = useCallback(
    (reason: PlayStateReason) => {
      if (!sim.current.playing) return;
      const t = Math.min(durationSec, sim.current.base + (performance.now() - sim.current.startedAt) / 1000);
      sim.current = { playing: false, base: t, startedAt: 0 };
      setSimPlaying(false);
      emitTime(reason === "ended" ? durationSec : t);
      onStateRef.current(false, reason);
    },
    [durationSec, emitTime],
  );

  useEffect(() => {
    if (src || !simPlaying) return;
    const timer = setInterval(() => {
      const t = sim.current.base + (performance.now() - sim.current.startedAt) / 1000;
      if (t >= durationSec) simStop("ended");
      else emitTime(t);
    }, 100);
    return () => clearInterval(timer);
  }, [src, simPlaying, durationSec, simStop, emitTime]);

  // 영상 주소가 바뀌면(영상 교체) 가상 재생을 멈추고 처음으로
  useEffect(() => {
    sim.current = { playing: false, base: 0, startedAt: 0 };
    setSimPlaying(false);
    emitTime(0);
  }, [src, emitTime]);

  const handle: VideoPlayerHandle = {
    seek(sec) {
      const t = Math.max(0, Math.min(sec, durationSec));
      const v = videoRef.current;
      if (src && v) v.currentTime = t;
      if (!src) sim.current = { ...sim.current, base: t, startedAt: performance.now() };
      emitTime(t);
    },
    play() {
      if (src) {
        void videoRef.current?.play().catch(() => undefined);
        return;
      }
      if (sim.current.playing) return;
      const base = sim.current.base >= durationSec ? 0 : sim.current.base;
      sim.current = { playing: true, base, startedAt: performance.now() };
      setSimPlaying(true);
      onStateRef.current(true, "play");
    },
    pause() {
      if (src) videoRef.current?.pause();
      else simStop("pause");
    },
    togglePlay() {
      if (handle.isPlaying()) handle.pause();
      else handle.play();
    },
    getCurrentTime() {
      if (src) return videoRef.current?.currentTime ?? timeRef.current;
      if (!sim.current.playing) return sim.current.base;
      return sim.current.base + (performance.now() - sim.current.startedAt) / 1000;
    },
    isPlaying() {
      if (src) {
        const v = videoRef.current;
        return !!v && !v.paused && !v.ended;
      }
      return sim.current.playing;
    },
  };
  useImperativeHandle(ref, () => handle);

  // ── 경계 끌기 ──
  const [dragKey, setDragKey] = useState<string | null>(null);
  const boundaries = editable && onSegmentsChange ? buildBoundaries(segments) : [];

  function secFromPointer(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return ((clientX - rect.left) / rect.width) * durationSec;
  }

  function onHandlePointerDown(e: PointerEvent<HTMLDivElement>, b: Boundary) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragKey(b.key);
  }
  function onHandlePointerMove(e: PointerEvent<HTMLDivElement>, b: Boundary) {
    if (dragKey !== b.key || !onSegmentsChange) return;
    onSegmentsChange(moveBoundary(segments, b, secFromPointer(e.clientX), durationSec));
  }
  function onHandlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragKey(null);
  }
  function onHandleKeyDown(e: KeyboardEvent<HTMLDivElement>, b: Boundary) {
    if (!onSegmentsChange) return;
    const step = e.shiftKey ? 0.1 : 1;
    let delta = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = step;
    else return;
    e.preventDefault();
    e.stopPropagation();
    onSegmentsChange(moveBoundary(segments, b, b.sec + delta, durationSec));
  }

  function boundaryLabel(b: Boundary): string {
    const l = b.left !== null ? segments[b.left] : null;
    const r = b.right !== null ? segments[b.right] : null;
    if (l && r) return `${l.order}구간 끝과 ${r.order}구간 시작 경계`;
    if (l) return `${l.order}구간 끝`;
    return `${r?.order}구간 시작`;
  }

  const playing = src ? false : simPlaying;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg bg-black">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls={!blackout}
            playsInline
            className="mx-auto max-h-[420px] w-full"
            onTimeUpdate={(e) => emitTime(e.currentTarget.currentTime)}
            onPlay={() => onPlayStateChange(true, "play")}
            onPause={(e) => {
              if (!e.currentTarget.ended) onPlayStateChange(false, "pause");
            }}
            onEnded={() => onPlayStateChange(false, "ended")}
          />
        ) : (
          <div className="flex aspect-video max-h-[320px] w-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-300">
            {loadingSrc ? (
              <p role="status">영상을 불러오는 중…</p>
            ) : (
              <>
                <p>이 콘텐츠에는 영상 파일이 없습니다. 재생하면 영상 없이 시간만 흘러 구간 안내를 확인할 수 있습니다.</p>
                <button type="button" onClick={() => handle.togglePlay()} className="rounded-md bg-white/15 px-4 py-2 font-medium text-white hover:bg-white/25">
                  {playing ? "❚❚ 정지" : "▶ 시간만 재생"}
                </button>
              </>
            )}
          </div>
        )}
        {blackout && (
          <div className="absolute inset-0 flex items-center justify-center bg-black text-sm text-slate-400" aria-hidden>
            화면 가림 · 시각장애인 사용자처럼 소리로만 확인하는 중
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            현재 <span className="font-mono">{formatTimecode(currentTime)}</span> / {formatTimecode(durationSec)}
          </span>
          <span className="flex gap-3">
            {(Object.keys(SEGMENT_KIND_LABELS) as SegmentKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className={`inline-block h-2 w-3 rounded-sm ${SEGMENT_COLORS[k]}`} aria-hidden />
                {SEGMENT_KIND_LABELS[k]}
              </span>
            ))}
          </span>
        </div>
        <div ref={trackRef} className="relative h-12 w-full rounded-md bg-slate-100">
          <ul className="absolute inset-0" aria-label="구간 타임라인">
            {segments.map((s) => {
              const left = (Math.max(0, s.startSec) / total) * 100;
              const width = (Math.max(0, s.endSec - s.startSec) / total) * 100;
              const active = s.id === activeSegmentId;
              return (
                <li key={s.id} className="absolute top-1.5 bottom-1.5" style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}>
                  <button
                    type="button"
                    title={`${s.order}. ${s.title} (${formatTimecode(s.startSec)}–${formatTimecode(s.endSec)})`}
                    aria-label={`${s.order}구간 ${s.title}, ${formatTimecode(s.startSec)}부터 ${formatTimecode(s.endSec)}까지${active ? ", 지금 재생 위치" : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSegmentClick(s)}
                    className={`h-full w-full overflow-hidden rounded-sm px-1 text-left text-[11px] leading-tight text-white ${SEGMENT_COLORS[s.kind]} ${active ? "ring-2 ring-amber-400 ring-offset-1" : "opacity-85 hover:opacity-100"}`}
                  >
                    <span className="block truncate">
                      {s.order}. {s.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {boundaries.map((b) => {
            const { min, max } = boundaryLimits(segments, b, durationSec);
            return (
              <div
                key={b.key}
                role="slider"
                tabIndex={0}
                aria-label={boundaryLabel(b)}
                aria-valuemin={Math.round(min * 10) / 10}
                aria-valuemax={Math.round(max * 10) / 10}
                aria-valuenow={b.sec}
                aria-valuetext={formatTimecode(b.sec)}
                title={`${boundaryLabel(b)} ${formatTimecode(b.sec)} · 끌어서 조절 (방향키 1초, Shift+방향키 0.1초)`}
                onPointerDown={(e) => onHandlePointerDown(e, b)}
                onPointerMove={(e) => onHandlePointerMove(e, b)}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
                onKeyDown={(e) => onHandleKeyDown(e, b)}
                className={`absolute top-0 bottom-0 z-10 flex w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center ${dragKey === b.key ? "opacity-100" : "opacity-70 hover:opacity-100 focus-visible:opacity-100"}`}
                style={{ left: `${(b.sec / total) * 100}%` }}
              >
                <span className="h-full w-1 rounded-full border border-slate-700 bg-white" aria-hidden />
              </div>
            );
          })}

          <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-red-600" style={{ left: `${(Math.min(currentTime, total) / total) * 100}%` }} aria-hidden />
        </div>
      </div>
    </div>
  );
});
