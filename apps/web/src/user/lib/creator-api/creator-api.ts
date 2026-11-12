import type { AdminApiErrorCode, ContentJob, CreateContentJobInput, Id, MyContent, SubmitMyContentInput, UpdateMyGuidesInput, VideoAsset } from "@yconic/shared-types";

/**
 * 회원 콘텐츠 올리기에 쓰는 데이터 접근 (shared-types/creator-api.ts).
 * 화면은 이 인터페이스만 쓰고, 서버(HTTP) 구현과 모의 구현을 바꿔 끼운다.
 */
export interface CreatorApi {
  /** 영상 파일을 올린다. 진행률은 0~1 */
  uploadVideo(file: File, onProgress?: (fraction: number) => void): Promise<VideoAsset>;
  /** 어디에도 연결되지 않은 내 영상을 지운다 (작업 만들기가 실패했을 때 정리용) */
  deleteVideo(videoId: Id): Promise<void>;
  createJob(input: CreateContentJobInput): Promise<ContentJob>;
  getJob(id: Id): Promise<ContentJob>;
  listMyContents(): Promise<MyContent[]>;
  getMyContent(id: Id): Promise<MyContent>;
  updateMyGuides(id: Id, input: UpdateMyGuidesInput): Promise<MyContent>;
  submitMyContent(id: Id, input: SubmitMyContentInput): Promise<MyContent>;
}

export class CreatorApiError extends Error {
  constructor(
    public readonly code: AdminApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CreatorApiError";
  }
}

export function creatorErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
}
