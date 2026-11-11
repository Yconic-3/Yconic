import type { Id } from "./common";
import type { ContentStatus, ExerciseContent } from "./exercise";
import type { ContentAction } from "./workflow";

/**
 * 관리자 API 요청 형식. 관리자 화면(apps/web/src/admin)과 백엔드(apps/api)가 이 형식으로 주고받는다.
 * 모든 요청에 관리자 계정의 Authorization: Bearer <token> 이 필요하다 (없으면 401, 관리자가 아니면 403).
 * 백엔드 엔드포인트 제안:
 *   POST   /admin/videos                         multipart(file, durationSec, width, height) → VideoAsset (저장소에 저장)
 *   GET    /admin/videos/:id/playback-url        → { url }                      (서명된 재생 주소)
 *   DELETE /admin/videos/:id                     → 204   (작업·콘텐츠에 연결되지 않은 영상만. 연결돼 있으면 409)
 *   GET    /admin/contents?status=&query=        → ExerciseContent[]
 *   GET    /admin/contents/:id                   → ExerciseContent
 *   PATCH  /admin/contents/:id                   UpdateExerciseContentInput → ExerciseContent
 *   PUT    /admin/contents/:id/video             ReplaceContentVideoInput → ExerciseContent  (구간은 유지)
 *   POST   /admin/contents/:id/reanalyze         ReanalyzeContentInput → ContentJob          (완료 시 구간 교체)
 *   POST   /admin/contents/:id/actions           ChangeContentStatusInput → ExerciseContent
 *          (APPROVE는 selfApprovalBlockedReason으로 자기 승인을 403 거절, SUBMIT_FOR_REVIEW 때 submittedBy 기록)
 *   POST   /admin/contents/:id/tts               RequestTtsInput → ExerciseContent
 *   GET    /admin/content-jobs                   → ContentJob[]
 *   POST   /admin/content-jobs                   CreateContentJobInput → ContentJob  (큐에 넣음)
 *   POST   /admin/content-jobs/:id/retry         → ContentJob
 *   GET    /admin/audit-logs?targetId=           → AuditLog[]
 */

export interface ContentListFilter {
  status?: ContentStatus;
  /** 제목·요약·태그 검색어 */
  query?: string;
}

export type EditableContentFields =
  | "title"
  | "summary"
  | "category"
  | "difficulty"
  | "tags"
  | "precautions"
  | "segments"
  | "internalNote";

export interface UpdateExerciseContentInput extends Pick<ExerciseContent, EditableContentFields> {
  /** 수정을 시작할 때 받은 version. 서버 version과 다르면 409 충돌로 거절한다. */
  expectedVersion: number;
}

export interface ChangeContentStatusInput {
  action: ContentAction;
  /** REQUEST_CHANGES일 때 필수인 검수 의견 */
  comment?: string;
}

/** 콘텐츠의 영상을 먼저 올린 다른 영상으로 바꾼다. 구간은 그대로 두며, 길이가 다르면 검사 규칙이 알려 준다. */
export interface ReplaceContentVideoInput {
  videoId: Id;
  expectedVersion: number;
}

/**
 * 콘텐츠의 현재 영상을 다시 분석한다. 작업이 끝나면 구간과 안내문이 새 결과로 바뀐다.
 * 그 사이 콘텐츠가 검수 중·승인 상태가 되면 결과를 반영하지 않고 작업을 실패로 끝낸다.
 */
export interface ReanalyzeContentInput {
  requestNote: string;
  expectedVersion: number;
}

export interface RequestTtsInput {
  segmentIds: Id[];
}

export interface PlaybackUrlResponse {
  url: string | null;
}

export type AdminApiErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "UNKNOWN";

export interface AdminApiErrorBody {
  code: AdminApiErrorCode;
  message: string;
}
