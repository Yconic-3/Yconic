"use client";

import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  type EditableContentFields,
  type ExerciseContent,
} from "@yconic/shared-types";
import { Card, Field, Input, Select, Textarea } from "./ui";

export type ContentDraft = Pick<ExerciseContent, EditableContentFields>;

interface Props {
  draft: ContentDraft;
  onChange(next: ContentDraft): void;
  editable: boolean;
}

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 제목·요약·분류 같은 기본 정보 편집. 구간은 SegmentEditor가 맡는다. */
export function ContentInfoEditor({ draft, onChange, editable }: Props) {
  const set = <K extends keyof ContentDraft>(key: K, value: ContentDraft[K]) => onChange({ ...draft, [key]: value });

  return (
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
          <Field label="주의사항" hint="한 줄에 하나씩. 영상 시작 전에 음성으로 읽어 줍니다.">
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
  );
}
