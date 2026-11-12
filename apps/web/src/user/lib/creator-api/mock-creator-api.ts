import { canCreatorEdit, creatorSubmitBlockedReason, toMyContent, type ExerciseContent } from "@yconic/shared-types";
import type { SignedInAccount } from "@/lib/auth";
import type { MockBackend } from "@/mock/mock-admin-api";
import { CreatorApiError, type CreatorApi } from "./creator-api";

/**
 * 모의 모드(서버 없이 화면만 볼 때)의 회원 콘텐츠 올리기.
 * 관리자 화면과 같은 브라우저 저장소의 모의 백엔드를 쓰므로, 여기서 검수를 요청하면 관리자 화면에 나온다.
 * 모의 백엔드는 관리자 역할로만 동작하므로 회원을 편집자로 대신 세우고, 자기 것만 다루도록 여기서 거른다.
 * (그래서 모의 모드의 감사 로그에는 회원이 '편집자'로 남는다. 서버 모드에서는 '회원'이다.)
 */
export function createMockCreatorApi(backend: MockBackend, getAccount: () => SignedInAccount | null): CreatorApi {
  function me(): SignedInAccount {
    const a = getAccount();
    if (!a) throw new CreatorApiError("UNAUTHORIZED", "로그인이 필요합니다.");
    return a;
  }

  async function own(id: string): Promise<ExerciseContent> {
    const account = me();
    const c = await backend.getContent(id).catch(() => null);
    if (!c || c.createdBy !== account.id) throw new CreatorApiError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.");
    return c;
  }

  return {
    uploadVideo: async (file, onProgress) => {
      me();
      return backend.uploadVideo(file, onProgress);
    },
    deleteVideo: async (videoId) => {
      me();
      return backend.deleteVideo(videoId);
    },
    createJob: async (input) => {
      me();
      return backend.createJob(input);
    },
    async getJob(id) {
      const account = me();
      const job = (await backend.listJobs()).find((j) => j.id === id && j.requestedBy === account.id);
      if (!job) throw new CreatorApiError("NOT_FOUND", "제작 작업을 찾을 수 없습니다.");
      return job;
    },
    async listMyContents() {
      const account = me();
      return (await backend.listContents()).filter((c) => c.createdBy === account.id).map(toMyContent);
    },
    getMyContent: async (id) => toMyContent(await own(id)),
    async updateMyGuides(id, input) {
      const c = await own(id);
      if (!canCreatorEdit(c)) throw new CreatorApiError("FORBIDDEN", "지금 상태에서는 고칠 수 없습니다.");
      const guides = new Map(input.segments.map((s) => [s.id, s.voiceGuide]));
      const updated = await backend.updateContent(id, {
        title: c.title,
        summary: c.summary,
        category: c.category,
        difficulty: c.difficulty,
        tags: c.tags,
        precautions: c.precautions,
        internalNote: c.internalNote,
        segments: c.segments.map((s) => (guides.has(s.id) ? { ...s, voiceGuide: guides.get(s.id)! } : s)),
        expectedVersion: input.expectedVersion,
      });
      return toMyContent(updated);
    },
    async submitMyContent(id, input) {
      const c = await own(id);
      if (c.version !== input.expectedVersion) throw new CreatorApiError("CONFLICT", "다른 곳에서 먼저 수정했습니다. 새로 고친 뒤 다시 시도해 주세요.");
      const blocked = creatorSubmitBlockedReason(c, input.confirmed);
      if (blocked) throw new CreatorApiError("VALIDATION", blocked);
      return toMyContent(await backend.changeContentStatus(id, { action: "SUBMIT_FOR_REVIEW" }));
    },
  };
}
