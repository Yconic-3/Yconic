"use client";

import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  VOICE_GUIDE_MAX_LENGTH,
  type EditableContentFields,
  type ExerciseContent,
  type ExerciseStep,
} from "@yconic/shared-types";
import { TtsStatusBadge } from "./status-badge";
import { Button, Card, Field, Input, Select, Textarea } from "./ui";

export type ContentDraft = Pick<ExerciseContent, EditableContentFields>;

interface Props {
  draft: ContentDraft;
  onChange(next: ContentDraft): void;
  /** 내용을 고칠 수 있는 상태·권한인지 */
  editable: boolean;
  /** 저장하지 않은 변경이 있으면 음성 생성 버튼을 잠근다 */
  dirty: boolean;
  canRequestTts: boolean;
  onRequestTts(stepIds: string[]): void;
}

let localSeq = 0;
function newStep(order: number): ExerciseStep {
  return {
    id: `new-${Date.now().toString(36)}-${(localSeq++).toString(36)}`,
    order,
    title: "",
    instruction: "",
    voiceGuide: "",
    durationSec: 30,
    repetitions: null,
    restAfterSec: 10,
    tts: { status: "NONE", audioUrl: null, generatedForText: null, failureReason: null },
  };
}

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ContentEditor({ draft, onChange, editable, dirty, canRequestTts, onRequestTts }: Props) {
  const set = <K extends keyof ContentDraft>(key: K, value: ContentDraft[K]) => onChange({ ...draft, [key]: value });

  function updateStep(index: number, patch: Partial<ExerciseStep>) {
    const steps = draft.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
    set("steps", steps);
  }
  function moveStep(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target]!, steps[index]!];
    set("steps", steps.map((s, i) => ({ ...s, order: i + 1 })));
  }
  function removeStep(index: number) {
    // 저장 전에는 "되돌리기"로 복구할 수 있으므로 별도 확인 없이 지운다.
    set("steps", draft.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
  }

  const ttsLocked = !canRequestTts || !editable || dirty;
  const ttsHint = !editable ? "초안 또는 수정 요청 상태에서만 음성을 만들 수 있습니다." : dirty ? "먼저 저장해야 바뀐 안내문으로 음성을 만듭니다." : "";
  const needsTts = draft.steps.filter((s) => s.tts.status !== "READY" || s.tts.generatedForText !== s.voiceGuide);

  return (
    <div className="space-y-4">
      <Card title="기본 정보">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="제목" required>
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} disabled={!editable} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="요약" required hint="사용자 앱의 운동 목록과 음성 소개에 쓰입니다.">
              <Textarea value={draft.summary} onChange={(e) => set("summary", e.target.value)} disabled={!editable} />
            </Field>
          </div>
          <Field label="분류">
            <Select value={draft.category} onChange={(e) => set("category", e.target.value as ContentDraft["category"])} disabled={!editable}>
              {EXERCISE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXERCISE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="난이도">
            <Select value={draft.difficulty} onChange={(e) => set("difficulty", e.target.value as ContentDraft["difficulty"])} disabled={!editable}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="태그" hint="쉼표로 구분합니다. 사용자가 음성으로 검색할 때 쓰입니다.">
              <Input
                value={draft.tags.join(", ")}
                onChange={(e) =>
                  set(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  )
                }
                disabled={!editable}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="주의사항" hint="한 줄에 하나씩. 운동 시작 전에 음성으로 읽어 줍니다.">
              <Textarea value={draft.precautions.join("\n")} onChange={(e) => set("precautions", linesToList(e.target.value))} disabled={!editable} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="관리자 내부 메모" hint="사용자 화면이나 사용자 AI 답변에는 절대 쓰이지 않습니다.">
              <Textarea value={draft.internalNote} onChange={(e) => set("internalNote", e.target.value)} disabled={!editable} />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title={`운동 단계 (${draft.steps.length})`}
        actions={
          <>
            {canRequestTts && needsTts.length > 0 && (
              <Button onClick={() => onRequestTts(needsTts.map((s) => s.id))} disabled={ttsLocked} title={ttsHint}>
                필요한 단계 음성 모두 생성 ({needsTts.length})
              </Button>
            )}
            {editable && (
              <Button variant="primary" onClick={() => set("steps", [...draft.steps, newStep(draft.steps.length + 1)])}>
                단계 추가
              </Button>
            )}
          </>
        }
      >
        {ttsHint && canRequestTts && <p className="mb-3 text-xs text-slate-500">{ttsHint}</p>}
        {draft.steps.length === 0 && <p className="text-sm text-slate-500">아직 단계가 없습니다. 단계를 추가해 주세요.</p>}
        <ol className="space-y-4">
          {draft.steps.map((s, i) => {
            const stale = s.tts.status === "READY" && s.tts.generatedForText !== s.voiceGuide;
            return (
              <li key={s.id} className="rounded-md border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{i + 1}단계</h3>
                  <div className="flex items-center gap-2">
                    <TtsStatusBadge status={s.tts.status} stale={stale} />
                    {canRequestTts && (s.tts.status === "NONE" || s.tts.status === "FAILED" || stale) && (
                      <Button className="px-2 py-1 text-xs" onClick={() => onRequestTts([s.id])} disabled={ttsLocked} title={ttsHint}>
                        음성 생성
                      </Button>
                    )}
                    {editable && (
                      <>
                        <Button className="px-2 py-1 text-xs" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label={`${i + 1}단계 위로`}>
                          ↑
                        </Button>
                        <Button className="px-2 py-1 text-xs" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1} aria-label={`${i + 1}단계 아래로`}>
                          ↓
                        </Button>
                        <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => removeStep(i)}>
                          삭제
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {s.tts.status === "FAILED" && s.tts.failureReason && <p className="mb-2 text-xs text-red-700">음성 생성 실패: {s.tts.failureReason}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Field label="단계 제목" required>
                      <Input value={s.title} onChange={(e) => updateStep(i, { title: e.target.value })} disabled={!editable} />
                    </Field>
                  </div>
                  <div className="md:col-span-2">
                    <Field label="동작 설명" hint="관리자 검수용 설명. 사용자 화면의 텍스트 안내로도 쓰입니다.">
                      <Textarea value={s.instruction} onChange={(e) => updateStep(i, { instruction: e.target.value })} disabled={!editable} />
                    </Field>
                  </div>
                  <div className="md:col-span-2">
                    <Field
                      label="음성 안내문"
                      required
                      hint={`${s.voiceGuide.length}/${VOICE_GUIDE_MAX_LENGTH}자. 화면을 보지 않아도 이해되도록 몸의 감각과 방향으로 설명합니다. "이렇게", "화면" 같은 표현은 피합니다.`}
                    >
                      <Textarea value={s.voiceGuide} onChange={(e) => updateStep(i, { voiceGuide: e.target.value })} disabled={!editable} className="min-h-24" />
                    </Field>
                  </div>
                  <Field label="운동 시간 (초)" required>
                    <Input type="number" min={1} value={s.durationSec} onChange={(e) => updateStep(i, { durationSec: Number(e.target.value) })} disabled={!editable} />
                  </Field>
                  <Field label="반복 횟수" hint="시간만 재는 동작이면 비워 둡니다.">
                    <Input
                      type="number"
                      min={1}
                      value={s.repetitions ?? ""}
                      onChange={(e) => updateStep(i, { repetitions: e.target.value === "" ? null : Number(e.target.value) })}
                      disabled={!editable}
                    />
                  </Field>
                  <Field label="단계 후 휴식 (초)">
                    <Input type="number" min={0} value={s.restAfterSec} onChange={(e) => updateStep(i, { restAfterSec: Number(e.target.value) })} disabled={!editable} />
                  </Field>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
