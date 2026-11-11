"use client";

import {
  CONTENT_JOB_STATUS_LABELS,
  CONTENT_STATUS_LABELS,
  TTS_STATUS_LABELS,
  type ContentJobStatus,
  type ContentStatus,
  type TtsStatus,
} from "@yconic/shared-types";
import { Badge } from "./ui";

type Tone = Parameters<typeof Badge>[0]["tone"];

const contentTone: Record<ContentStatus, Tone> = {
  DRAFT: "gray",
  IN_REVIEW: "blue",
  CHANGES_REQUESTED: "amber",
  APPROVED: "purple",
  PUBLISHED: "green",
  ARCHIVED: "gray",
};

const jobTone: Record<ContentJobStatus, Tone> = {
  QUEUED: "gray",
  ANALYZING_VIDEO: "blue",
  EXTRACTING_STEPS: "blue",
  GENERATING_SCRIPT: "blue",
  GENERATING_TTS: "blue",
  COMPLETED: "green",
  FAILED: "red",
};

const ttsTone: Record<TtsStatus, Tone> = {
  NONE: "gray",
  REQUESTED: "amber",
  GENERATING: "blue",
  READY: "green",
  FAILED: "red",
};

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return <Badge tone={contentTone[status]}>{CONTENT_STATUS_LABELS[status]}</Badge>;
}

export function JobStatusBadge({ status }: { status: ContentJobStatus }) {
  return <Badge tone={jobTone[status]}>{CONTENT_JOB_STATUS_LABELS[status]}</Badge>;
}

export function TtsStatusBadge({ status, stale }: { status: TtsStatus; stale?: boolean }) {
  if (status === "READY" && stale) return <Badge tone="amber">재생성 필요</Badge>;
  return <Badge tone={ttsTone[status]}>{TTS_STATUS_LABELS[status]}</Badge>;
}

export function isJobActive(status: ContentJobStatus): boolean {
  return status !== "COMPLETED" && status !== "FAILED";
}
