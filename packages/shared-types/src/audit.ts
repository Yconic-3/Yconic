import type { AdminRole } from "./admin";
import type { Id, ISODateString } from "./common";

export const AUDIT_ACTIONS = [
  "CONTENT_JOB_CREATED",
  "CONTENT_JOB_RETRIED",
  "CONTENT_CREATED",
  "CONTENT_UPDATED",
  "CONTENT_STATUS_CHANGED",
  "TTS_REQUESTED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CONTENT_JOB_CREATED: "제작 작업 생성",
  CONTENT_JOB_RETRIED: "제작 작업 재시도",
  CONTENT_CREATED: "콘텐츠 생성",
  CONTENT_UPDATED: "콘텐츠 수정",
  CONTENT_STATUS_CHANGED: "상태 변경",
  TTS_REQUESTED: "음성 생성 요청",
};

/** 모든 생성·수정·승인·배포 작업은 감사 로그를 남긴다 (설계 문서 4장) */
export interface AuditLog {
  id: Id;
  action: AuditAction;
  actorId: Id;
  actorName: string;
  actorRole: AdminRole;
  targetType: "CONTENT" | "CONTENT_JOB";
  targetId: Id;
  summary: string;
  createdAt: ISODateString;
}
