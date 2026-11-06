"use client";

import { SEGMENT_KIND_LABELS, type ExerciseSegment, type SegmentKind } from "@yconic/shared-types";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { formatTimecode } from "@/lib/video";

export interface VideoPlayerHandle {
  seek(sec: number): void;
  play(): void;
  pause(): void;
  getCurrentTime(): number;
  isPlaying(): boolean;
}

interface Props {
  src: string | null;
  /** 재생 주소를 아직 불러오는 중인지 */
  loadingSrc: boolean;
  durationSec: number;
  segments: ExerciseSegment[];
  activeSegmentId: string | null;
  onTimeUpdate(sec: number): void;
  onPlayStateChange(playing: boolean): void;
  onSegmentClick(segment: ExerciseSegment): void;
}

export const SEGMENT_COLORS: Record<SegmentKind, string> = {
  INTRO: "bg-slate-400",
  EXERCISE: "bg-blue-500",
  REST: "bg-emerald-400",
  OUTRO: "bg-slate-400",
};

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(
  { src, loadingSrc, durationSec, segments, activeSegmentId, onTimeUpdate, onPlayStateChange, onSegmentClick },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const total = durationSec > 0 ? durationSec : 1;

  useImperativeHandle(ref, () => ({
    seek(sec) {
      const v = videoRef.current;
      const clamped = Math.max(0, Math.min(sec, durationSec));
      if (v) v.currentTime = clamped;
      setTime(clamped);
      onTimeUpdate(clamped);
    },
    play() {
      void videoRef.current?.play().catch(() => undefined);
    },
    pause() {
      videoRef.current?.pause();
    },
    getCurrentTime() {
      return videoRef.current?.currentTime ?? time;
    },
    isPlaying() {
      const v = videoRef.current;
      return !!v && !v.paused && !v.ended;
    },
  }));

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg bg-black">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            controls
            playsInline
            className="mx-auto max-h-[420px] w-full"
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setTime(t);
              onTimeUpdate(t);
            }}
            onPlay={() => onPlayStateChange(true)}
            onPause={() => onPlayStateChange(false)}
            onEnded={() => onPlayStateChange(false)}
          />
        ) : (
          <div className="flex aspect-video max-h-[320px] w-full items-center justify-center px-6 text-center text-sm text-slate-300" role="status">
            {loadingSrc ? "영상을 불러오는 중…" : "이 예시 데이터에는 영상 파일이 없습니다. 타임라인으로 구간을 확인하고, 실제 영상은 새 AI 제작 요청에서 올려 보세요."}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
          <span>
            현재 <span className="font-mono">{formatTimecode(time)}</span> / {formatTimecode(durationSec)}
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
        <div className="relative h-10 w-full overflow-hidden rounded-md bg-slate-100" role="list" aria-label="구간 타임라인">
          {segments.map((s) => {
            const left = (Math.max(0, s.startSec) / total) * 100;
            const width = (Math.max(0, s.endSec - s.startSec) / total) * 100;
            const active = s.id === activeSegmentId;
            return (
              <button
                key={s.id}
                type="button"
                role="listitem"
                title={`${s.order}. ${s.title} (${formatTimecode(s.startSec)}–${formatTimecode(s.endSec)})`}
                aria-label={`${s.order}구간 ${s.title}, ${formatTimecode(s.startSec)}부터 ${formatTimecode(s.endSec)}까지`}
                onClick={() => onSegmentClick(s)}
                className={`absolute top-1 bottom-1 overflow-hidden rounded-sm px-1 text-left text-[11px] leading-tight text-white ${SEGMENT_COLORS[s.kind]} ${active ? "ring-2 ring-amber-400 ring-offset-1" : "opacity-80 hover:opacity-100"}`}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
              >
                <span className="block truncate">
                  {s.order}. {s.title}
                </span>
              </button>
            );
          })}
          <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-red-600" style={{ left: `${(Math.min(time, total) / total) * 100}%` }} aria-hidden />
        </div>
      </div>
    </div>
  );
});
