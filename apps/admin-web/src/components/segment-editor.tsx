"use client";

import {
  SEGMENT_KINDS,
  SEGMENT_KIND_LABELS,
  VOICE_GUIDE_MAX_LENGTH,
  estimateSpeechSec,
  isTtsStale,
  segmentDurationSec,
  type ExerciseSegment,
  type SegmentKind,
} from "@yconic/shared-types";
import { useState } from "react";
import { renumber, round1, splitSegmentAt } from "@/lib/timeline";
import { formatTimecode, parseTimecode } from "@/lib/video";
import { TtsStatusBadge } from "./status-badge";
import { Button, Card, Field, Input, Select, Textarea } from "./ui";
import { SEGMENT_COLORS } from "./video-player";

interface Props {
  segments: ExerciseSegment[];
  durationSec: number;
  onChange(next: ExerciseSegment[]): void;
  editable: boolean;
  /** 저장하지 않은 변경이 있으면 음성 생성 버튼을 잠근다 */
  dirty: boolean;
  canRequestTts: boolean;
  onRequestTts(segmentIds: string[]): void;
  activeSegmentId: string | null;
  getCurrentTime(): number;
  onPlaySegment(segment: ExerciseSegment): void;
  onListen(segment: ExerciseSegment): void;
  speechSupported: boolean;
}

let localSeq = 0;
export function newLocalSegmentId() {
  return `new-${Date.now().toString(36)}-${(localSeq++).toString(36)}`;
}

function TimeInput({ value, onCommit, disabled, label }: { value: number; onCommit(sec: number): void; disabled: boolean; label: string }) {
  const [text, setText] = useState(formatTimecode(value));
  const [editing, setEditing] = useState(false);
  const shown = editing ? text : formatTimecode(value);
  return (
    <Input
      aria-label={label}
      className="w-24 font-mono"
      value={shown}
      disabled={disabled}
      onFocus={() => {
        setText(formatTimecode(value));
        setEditing(true);
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const parsed = parseTimecode(text);
        if (parsed !== null) onCommit(round1(parsed));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export function SegmentEditor({
  segments,
  durationSec,
  onChange,
  editable,
  dirty,
  canRequestTts,
  onRequestTts,
  activeSegmentId,
  getCurrentTime,
  onPlaySegment,
  onListen,
  speechSupported,
}: Props) {
  function update(index: number, patch: Partial<ExerciseSegment>) {
    onChange(segments.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= segments.length) return;
    const list = [...segments];
    [list[index], list[target]] = [list[target]!, list[index]!];
    onChange(renumber(list));
  }
  function remove(index: number) {
    onChange(renumber(segments.filter((_, i) => i !== index)));
  }
  function sortByStart() {
    onChange(renumber([...segments].sort((a, b) => a.startSec - b.startSec)));
  }
  function add() {
    const last = segments[segments.length - 1];
    const start = last ? Math.min(last.endSec, Math.max(0, durationSec - 5)) : 0;
    const end = Math.min(durationSec, start + 20);
    onChange(
      renumber([
        ...segments,
        {
          id: newLocalSegmentId(),
          order: 0,
          kind: "EXERCISE",
          startSec: round1(start),
          endSec: round1(end),
          title: "",
          instruction: "",
          voiceGuide: "",
          repetitions: null,
          tts: { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null },
        },
      ]),
    );
  }
  function splitAtCurrent(index: number) {
    const next = splitSegmentAt(segments, index, getCurrentTime(), newLocalSegmentId);
    if (next) onChange(next);
  }

  const ttsLocked = !canRequestTts || !editable || dirty;
  const ttsHint = !editable ? "초안 또는 수정 요청 상태에서만 음성을 만들 수 있습니다." : dirty ? "먼저 저장해야 바뀐 안내문으로 음성을 만듭니다." : "";
  const needsTts = segments.filter((s) => s.tts.status !== "READY" || isTtsStale(s));
  const unsorted = segments.some((s, i) => i > 0 && s.startSec < segments[i - 1]!.startSec);

  return (
    <Card
      title={`구간 (${segments.length})`}
      actions={
        <>
          {canRequestTts && needsTts.length > 0 && (
            <Button onClick={() => onRequestTts(needsTts.map((s) => s.id))} disabled={ttsLocked} title={ttsHint}>
              필요한 구간 음성 모두 생성 ({needsTts.length})
            </Button>
          )}
          {editable && unsorted && <Button onClick={sortByStart}>시작 시각 순으로 정렬</Button>}
          {editable && (
            <Button variant="primary" onClick={add}>
              구간 추가
            </Button>
          )}
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        사용자 앱은 영상을 재생하다가 각 구간이 시작되는 시각에 음성 안내문을 읽어 줍니다. 영상을 원하는 곳에 멈추고 &ldquo;현재&rdquo; 버튼으로 시작·끝 시각을 잡을 수 있습니다.
        {ttsHint && canRequestTts ? ` ${ttsHint}` : ""}
      </p>
      {segments.length === 0 && <p className="text-sm text-slate-500">아직 구간이 없습니다. 구간을 추가해 주세요.</p>}
      <ol className="space-y-3">
        {segments.map((s, i) => {
          const stale = isTtsStale(s);
          const len = segmentDurationSec(s);
          const speech = estimateSpeechSec(s.voiceGuide);
          const tooLong = len > 0 && speech > len;
          const active = s.id === activeSegmentId;
          return (
            <li key={s.id} id={`segment-${s.id}`} className={`rounded-md border p-4 ${active ? "border-amber-400 bg-amber-50/40" : "border-slate-200"}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-sm ${SEGMENT_COLORS[s.kind]}`} aria-hidden />
                  <h3 className="font-semibold">{i + 1}구간</h3>
                  <Select aria-label={`${i + 1}구간 종류`} className="w-24 py-1" value={s.kind} disabled={!editable} onChange={(e) => update(i, { kind: e.target.value as SegmentKind })}>
                    {SEGMENT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {SEGMENT_KIND_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                  <span className="font-mono text-sm text-slate-600">
                    {formatTimecode(s.startSec)} – {formatTimecode(s.endSec)} ({Math.round(len)}초)
                  </span>
                  <TtsStatusBadge status={s.tts.status} stale={stale} />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button className="px-2 py-1 text-xs" onClick={() => onPlaySegment(s)} title="이 구간부터 재생하고 안내문을 읽습니다">
                    ▶ 구간 재생
                  </Button>
                  {speechSupported && (
                    <Button className="px-2 py-1 text-xs" onClick={() => onListen(s)} title="브라우저 음성으로 안내문만 들어 봅니다">
                      🔊 안내 듣기
                    </Button>
                  )}
                  {canRequestTts && (s.tts.status === "NONE" || s.tts.status === "FAILED" || stale) && (
                    <Button className="px-2 py-1 text-xs" onClick={() => onRequestTts([s.id])} disabled={ttsLocked} title={ttsHint}>
                      음성 생성
                    </Button>
                  )}
                  {editable && (
                    <>
                      <Button className="px-2 py-1 text-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${i + 1}구간 위로`}>
                        ↑
                      </Button>
                      <Button className="px-2 py-1 text-xs" onClick={() => move(i, 1)} disabled={i === segments.length - 1} aria-label={`${i + 1}구간 아래로`}>
                        ↓
                      </Button>
                      <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => remove(i)}>
                        삭제
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {s.tts.status === "FAILED" && s.tts.failureReason && <p className="mb-2 text-xs text-red-700">음성 생성 실패: {s.tts.failureReason}</p>}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-wrap items-end gap-2 md:col-span-2">
                  <Field label="시작">
                    <div className="flex gap-1">
                      <TimeInput label={`${i + 1}구간 시작 시각`} value={s.startSec} disabled={!editable} onCommit={(sec) => update(i, { startSec: sec })} />
                      {editable && (
                        <Button className="px-2 py-1 text-xs" onClick={() => update(i, { startSec: round1(getCurrentTime()) })} title="재생 위치의 현재 시각을 시작으로">
                          현재
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label="끝">
                    <div className="flex gap-1">
                      <TimeInput label={`${i + 1}구간 끝 시각`} value={s.endSec} disabled={!editable} onCommit={(sec) => update(i, { endSec: sec })} />
                      {editable && (
                        <Button className="px-2 py-1 text-xs" onClick={() => update(i, { endSec: round1(getCurrentTime()) })} title="재생 위치의 현재 시각을 끝으로">
                          현재
                        </Button>
                      )}
                    </div>
                  </Field>
                  {editable && (
                    <Button className="px-2 py-1 text-xs" onClick={() => splitAtCurrent(i)} title="재생 위치의 현재 시각에서 이 구간을 둘로 나눕니다">
                      현재 시각에서 나누기
                    </Button>
                  )}
                  <Field label="반복 횟수" hint="시간만 재면 비워 둡니다">
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      value={s.repetitions ?? ""}
                      onChange={(e) => update(i, { repetitions: e.target.value === "" ? null : Number(e.target.value) })}
                      disabled={!editable}
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="구간 제목" required>
                    <Input value={s.title} onChange={(e) => update(i, { title: e.target.value })} disabled={!editable} />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="영상에 보이는 동작 (검수용)">
                    <Textarea className="min-h-16" value={s.instruction} onChange={(e) => update(i, { instruction: e.target.value })} disabled={!editable} />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="음성 안내문"
                    required
                    hint={`${s.voiceGuide.length}/${VOICE_GUIDE_MAX_LENGTH}자 · 읽는 데 약 ${speech}초${tooLong ? ` (구간 ${Math.round(len)}초보다 깁니다)` : ""}. 화면을 보지 않아도 이해되도록 몸의 감각과 방향으로 설명합니다.`}
                  >
                    <Textarea className={`min-h-24 ${tooLong ? "border-amber-400" : ""}`} value={s.voiceGuide} onChange={(e) => update(i, { voiceGuide: e.target.value })} disabled={!editable} />
                  </Field>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
