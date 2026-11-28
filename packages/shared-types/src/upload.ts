import type { Id } from "./common";

/**
 * 영상 나눠 올리기. 큰 영상을 작은 조각으로 잘라 차례로 보내고, 서버가 다시 합친다.
 * 서버 앞의 프록시가 한 번에 받는 크기를 작게 막아 둔 곳(약 1MB)에서도 큰 영상을 올릴 수 있다.
 * 회원(/me)과 관리자(/admin)가 같은 모양을 쓴다.
 *   POST   <앞>/uploads                       CreateUploadInput → UploadSession
 *   PUT    <앞>/uploads/:id/chunks/:index     본문: 조각(application/octet-stream) → UploadProgress
 *   POST   <앞>/uploads/:id/complete          → VideoAsset
 *   DELETE <앞>/uploads/:id                   → 204 (그만두기)
 * 조각은 0번부터 차례로 보낸다. 마지막 조각만 chunkBytes보다 작을 수 있다.
 * 같은 조각을 다시 보내도 된다 (응답을 못 받아 다시 보내는 경우).
 */
export interface CreateUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** 영상 길이와 크기는 브라우저가 파일에서 읽어 보낸다 */
  durationSec: number;
  width: number;
  height: number;
}

export interface UploadSession {
  id: Id;
  /** 조각 하나의 크기 (바이트). 서버가 정한다 */
  chunkBytes: number;
  /** 보내야 할 조각 수 */
  chunkCount: number;
}

export interface UploadProgress {
  /** 서버가 지금까지 받은 크기 (바이트) */
  receivedBytes: number;
}
