"use client";

import {
  SEGMENT_KINDS,
  SEGMENT_KIND_LABELS,
  VOICE_GUIDE_MAX_LENGTH,
  estimateSpeechSec,
  segmentDurationSec,
  type ContentIssue,
  type ExerciseSegment,
  type SegmentKind,
} from "@yconic/shared-types";
import { useState } from "react";
import { renumber, round1, splitSegmentAt } from "@/admin/lib/timeline";
import { formatTimecode, parseTimecode } from "@/admin/lib/video";
import { Button, Field, Input, Select, Textarea } from "./ui";
import { SEGMENT_COLORS } from "./video-player";

/**
 * 구간 목록 (docs/decisions/0023).
 * 구간을 한 줄씩 보여 주고, 누른 구간 하나만 펼쳐 고친다. 예전에는 모든 구간의 모든 칸이 펼쳐져 있어 화면이 아주 길었다.
 * 펼친 구간에서도 자주 고치는 것(제목, 음성 안내문)만 먼저 보이고, 시각·종류 같은 것은 "시간과 자세한 설정" 안에 있다.
 */

interface Props {
  segments: ExerciseSegment[];
  durationSec: number;
  onChange(next: ExerciseSegment[]): void;
  editable: boolean;
  /** 펼친 구간 (없으면 모두 접힘) */
  openId: string | null;
  onOpen(id: string | null): void;
  /** 지금 재생 중인 구간 (멈춰 있으면 null) */
  activeSegmentId: string | null;
  /** 구간별 문제 (검사 결과에서 이 구간에 해당하는 것) */
  issuesBySegment: Map<string, ContentIssue[]>;
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

export function SegmentList({ segments, durationSec, onChange, editable, openId, onOpen, activeSegmentId, issuesBySegment, getCurrentTime, onPlaySegment, onListen, speechSupported }: Props) {
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
    onOpen(null);
  }
  function sortByStart() {
    onChange(renumber([...segments].sort((a, b) => a.startSec - b.startSec)));
  }
  function add() {
    const last = segments[segments.length - 1];
    const start = last ? Math.min(last.endSec, Math.max(0, durationSec - 5)) : 0;
    const end = Math.min(durationSec, start + 20);
    const id = newLocalSegmentId();
    onChange(
      renumber([
        ...segments,
        {
          id,
          order: 0,
          kind: "EXERCISE",
          startSec: round1(start),
          endSec: round1(end),
          title: "",
          instruction: "",
          voiceGuide: "",
          conciseGuide: "",
          repetitions: null,
          tts: { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null },
        },
      ]),
    );
    onOpen(id);
  }
  function splitAtCurrent(index: number) {
    const next = splitSegmentAt(segments, index, getCurrentTime(), newLocalSegmentId);
    if (next) onChange(next);
  }

  const unsorted = segments.some((s, i) => i > 0 && s.startSec < segments[i - 1]!.startSec);

  return (
    <div>
      {segments.length === 0 && <p className="rounded-2xl border-2 border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">아직 구간이 없습니다.</p>}
      <ol className="space-y-2">
        {segments.map((s, i) => {
          const open = s.id === openId;
          const active = s.id === activeSegmentId;
          const issues = issuesBySegment.get(s.id) ?? [];
          const hasError = issues.some((x) => x.severity === "ERROR");
          const len = segmentDurationSec(s);
          const speech = estimateSpeechSec(s.voiceGuide);
          const tooLong = len > 0 && speech > len;
          const panelId = `segment-panel-${s.id}`;
          return (
            <li key={s.id} id={`segment-${s.id}`} className={`rounded-2xl border-2 bg-white ${open ? "border-blue-600" : active ? "border-amber-400" : "border-slate-200"}`}>
              <div className="flex items-stretch">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => onOpen(open ? null : s.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-l-2xl px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-extrabold text-white ${SEGMENT_COLORS[s.kind]}`} aria-hidden>
                    {i + 1}
                  </span>
                  <span className="w-[92px] flex-none font-mono text-xs text-slate-500">
                    {formatTimecode(s.startSec)}–{formatTimecode(s.endSec)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      <span className="sr-only">{i + 1}구간 </span>
                      {s.title || <span className="text-slate-400">(제목 없음)</span>}
                      {active && <span className="ml-2 text-xs font-bold text-amber-700">지금 재생 중</span>}
                    </span>
                    {!open && <span className="block truncate text-sm text-slate-500">{s.voiceGuide || "음성 안내문이 없습니다."}</span>}
                  </span>
                  {issues.length > 0 && (
                    <span className={`flex-none text-xs font-bold ${hasError ? "text-red-700" : "text-amber-700"}`}>
                      <span aria-hidden>⚠ </span>
                      {hasError ? "고쳐야 함" : "확인"}
                    </span>
                  )}
                  <span className="flex-none text-slate-400" aria-hidden>
                    {open ? "▲" : "▼"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onPlaySegment(s)}
                  aria-label={`${i + 1}구간부터 재생`}
                  title="이 구간부터 재생"
                  className="flex-none rounded-r-2xl border-l-2 border-slate-200 px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                >
                  ▶
                </button>
              </div>

              {open && (
                <div id={panelId} className="space-y-3 border-t-2 border-slate-200 p-3">
                  {issues.length > 0 && (
                    <ul className="space-y-0.5 text-xs">
                      {issues.map((x, k) => (
                        <li key={k} className={x.severity === "ERROR" ? "text-red-700" : "text-amber-700"}>
                          <span aria-hidden>⚠ </span>
                          {x.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Field label="구간 제목">
                    <Input value={s.title} onChange={(e) => update(i, { title: e.target.value })} disabled={!editable} />
                  </Field>
                  <Field
                    label="음성 안내문"
                    hint={`${s.voiceGuide.length}/${VOICE_GUIDE_MAX_LENGTH}자 · 읽는 데 약 ${speech}초${tooLong ? ` (구간 ${Math.round(len)}초보다 깁니다)` : ""}. 화면을 보지 않아도 알 수 있게 몸의 감각과 방향으로 씁니다.`}
                  >
                    <Textarea className={`min-h-28 ${tooLong ? "border-amber-400" : ""}`} value={s.voiceGuide} onChange={(e) => update(i, { voiceGuide: e.target.value })} disabled={!editable} />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    {speechSupported && (
                      <Button className="px-3 py-1.5" onClick={() => onListen(s)} title="안내문만 소리로 들어 봅니다">
                        <span aria-hidden>🔊</span> 안내 듣기
                      </Button>
                    )}
                    <Button className="px-3 py-1.5" onClick={() => onPlaySegment(s)} title="이 구간부터 영상을 재생하고 안내문을 읽습니다">
                      <span aria-hidden>▶</span> 영상과 함께 듣기
                    </Button>
                  </div>

                  <details className="rounded-xl border-2 border-slate-200">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-bold text-slate-600">
                      시간과 자세한 설정 <span className="font-normal text-slate-400">· {SEGMENT_KIND_LABELS[s.kind]} · {Math.round(len)}초{s.repetitions ? ` · ${s.repetitions}회` : ""}</span>
                    </summary>
                    <div className="space-y-3 border-t-2 border-slate-200 p-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <Field label="시작">
                          <div className="flex gap-1">
                            <TimeInput label={`${i + 1}구간 시작 시각`} value={s.startSec} disabled={!editable} onCommit={(sec) => update(i, { startSec: sec })} />
                            {editable && (
                              <Button className="px-2 py-1 text-xs" onClick={() => update(i, { startSec: round1(getCurrentTime()) })} title="영상의 지금 위치를 시작으로">
                                지금
                              </Button>
                            )}
                          </div>
                        </Field>
                        <Field label="끝">
                          <div className="flex gap-1">
                            <TimeInput label={`${i + 1}구간 끝 시각`} value={s.endSec} disabled={!editable} onCommit={(sec) => update(i, { endSec: sec })} />
                            {editable && (
                              <Button className="px-2 py-1 text-xs" onClick={() => update(i, { endSec: round1(getCurrentTime()) })} title="영상의 지금 위치를 끝으로">
                                지금
                              </Button>
                            )}
                          </div>
                        </Field>
                        <Field label="종류">
                          <Select aria-label={`${i + 1}구간 종류`} className="w-28" value={s.kind} disabled={!editable} onChange={(e) => update(i, { kind: e.target.value as SegmentKind })}>
                            {SEGMENT_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {SEGMENT_KIND_LABELS[k]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="반복 횟수">
                          <Input
                            type="number"
                            min={1}
                            className="w-24"
                            placeholder="없음"
                            value={s.repetitions ?? ""}
                            onChange={(e) => update(i, { repetitions: e.target.value === "" ? null : Number(e.target.value) })}
                            disabled={!editable}
                          />
                        </Field>
                      </div>
                      <Field label="배운 사람용 짧은 안내 (선택)" hint="이 동작을 이미 배운 회원에게는 이 짧은 안내를 읽어 줍니다. 비워 두면 위의 음성 안내문을 읽습니다.">
                        <Textarea className="min-h-16" value={s.conciseGuide ?? ""} onChange={(e) => update(i, { conciseGuide: e.target.value })} disabled={!editable} />
                      </Field>
                      <Field label="영상에 보이는 동작 (선택, 관리자만 봅니다)">
                        <Textarea className="min-h-16" value={s.instruction} onChange={(e) => update(i, { instruction: e.target.value })} disabled={!editable} />
                      </Field>
                      {editable && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button className="px-2.5 py-1 text-xs" onClick={() => splitAtCurrent(i)} title="영상의 지금 위치에서 이 구간을 둘로 나눕니다">
                            지금 위치에서 둘로 나누기
                          </Button>
                          <Button className="px-2.5 py-1 text-xs" onClick={() => move(i, -1)} disabled={i === 0}>
                            ↑ 위로
                          </Button>
                          <Button className="px-2.5 py-1 text-xs" onClick={() => move(i, 1)} disabled={i === segments.length - 1}>
                            ↓ 아래로
                          </Button>
                          <Button variant="danger" className="ml-auto px-2.5 py-1 text-xs" onClick={() => remove(i)}>
                            이 구간 지우기
                          </Button>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={add}>
            <span aria-hidden>＋</span> 구간 추가
          </Button>
          {unsorted && <Button onClick={sortByStart}>시작 시각 순으로 정렬</Button>}
        </div>
      )}
    </div>
  );
}
