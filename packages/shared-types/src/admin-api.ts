import type { Id } from "./common";
import type { ContentStatus, ExerciseContent } from "./exercise";
import type { ContentAction } from "./workflow";

/**
 * 관리자 API 요청 형식. 관리자 웹(admin-web)과 백엔드(api)가 이 형식으로 주고받는다.
 * 백엔드 엔드포인트 제안:
 *   POST   /admin/videos                         multipart(file) → VideoAsset   (스토리지에 저장)
 *   GET    /admin/videos/:id/playback-url        → { url }                      (서명된 재생 주소)
 *   GET    /admin/contents?status=&query=        → ExerciseContent[]
 *   GET    /admin/contents/:id                   → ExerciseContent
 *   PATCH  /admin/contents/:id                   UpdateExerciseContentInput → ExerciseContent
 *   POST   /admin/contents/:id/actions           ChangeContentStatusInput → ExerciseContent
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
