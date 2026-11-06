import type { AdminRole } from "./admin";
import type { Id, ISODateString } from "./common";

export const AUDIT_ACTIONS = [
  "CONTENT_JOB_CREATED",
  "CONTENT_JOB_RETRIED",
  "CONTENT_CREATED",
  "CONTENT_UPDATED",
  "CONTENT_STATUS_CHANGED",
  "CONTENT_VIDEO_REPLACED",
  "CONTENT_REANALYZED",
  "TTS_REQUESTED",
  "VIDEO_DELETED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CONTENT_JOB_CREATED: "제작 작업 생성",
  CONTENT_JOB_RETRIED: "제작 작업 재시도",
  CONTENT_CREATED: "콘텐츠 생성",
  CONTENT_UPDATED: "콘텐츠 수정",
  CONTENT_STATUS_CHANGED: "상태 변경",
  CONTENT_VIDEO_REPLACED: "영상 교체",
  CONTENT_REANALYZED: "다시 분석 반영",
  TTS_REQUESTED: "음성 생성 요청",
  VIDEO_DELETED: "영상 삭제",
};

/** 모든 생성·수정·승인·배포 작업은 감사 로그를 남긴다 (설계 문서 4장) */
export interface AuditLog {
  id: Id;
  action: AuditAction;
  actorId: Id;
  actorName: string;
  actorRole: AdminRole;
  targetType: "CONTENT" | "CONTENT_JOB" | "VIDEO";
  targetId: Id;
  summary: string;
  createdAt: ISODateString;
}
