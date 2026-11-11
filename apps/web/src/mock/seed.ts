import type { AuditLog, ExerciseContent, VideoAsset } from "@yconic/shared-types";
import { createFixtures, FIXTURE_ADMIN_USERS, type FixtureJob } from "@yconic/fixtures";

/**
 * 모의 모드의 저장소 모양과 처음 상태.
 * 예시 데이터 자체는 @yconic/fixtures 에 있고, 데이터베이스 처음 데이터(pnpm db:seed)도 같은 것을 쓴다.
 */

/** 모의 로그인용 관리자 계정 */
export const MOCK_USERS = FIXTURE_ADMIN_USERS;

export type MockJob = FixtureJob;

export interface MockTtsRequest {
  contentId: string;
  segmentId: string;
  text: string;
  requestedAtMs: number;
}

/** 사용자 화면과 관리자 화면이 함께 쓰는 모의 저장소의 모양 */
export interface MockState {
  schemaVersion: 4;
  videos: VideoAsset[];
  contents: ExerciseContent[];
  jobs: MockJob[];
  auditLogs: AuditLog[];
  ttsRequests: MockTtsRequest[];
}

export function createSeedState(nowMs: number): MockState {
  return { schemaVersion: 4, ...createFixtures(nowMs), ttsRequests: [] };
}
