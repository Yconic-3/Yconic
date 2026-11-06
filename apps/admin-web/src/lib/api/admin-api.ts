import type {
  AdminApiErrorCode,
  AuditLog,
  ChangeContentStatusInput,
  ContentJob,
  ContentListFilter,
  CreateContentJobInput,
  ExerciseContent,
  Id,
  RequestTtsInput,
  UpdateExerciseContentInput,
} from "@yconic/shared-types";

/**
 * 관리자 웹이 사용하는 데이터 접근 인터페이스.
 * 화면 코드는 이 인터페이스만 사용하고, 모의 구현과 HTTP 구현은 바꿔 끼울 수 있다.
 */
export interface AdminApi {
  listContents(filter?: ContentListFilter): Promise<ExerciseContent[]>;
  getContent(id: Id): Promise<ExerciseContent>;
  updateContent(id: Id, input: UpdateExerciseContentInput): Promise<ExerciseContent>;
  changeContentStatus(id: Id, input: ChangeContentStatusInput): Promise<ExerciseContent>;
  requestTts(contentId: Id, input: RequestTtsInput): Promise<ExerciseContent>;
  listJobs(): Promise<ContentJob[]>;
  createJob(input: CreateContentJobInput): Promise<ContentJob>;
  retryJob(id: Id): Promise<ContentJob>;
  listAuditLogs(filter?: { targetId?: Id }): Promise<AuditLog[]>;
}

export class AdminApiError extends Error {
  constructor(
    public readonly code: AdminApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof AdminApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "알 수 없는 오류가 발생했습니다.";
}
