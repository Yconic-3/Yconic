import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { contents, type Database } from "@yconic/database";
import {
  EXERCISE_CATEGORIES,
  matchesExerciseFilter,
  toPublishedExercise,
  type ExerciseCategory,
  type ExerciseListFilter,
  type PublishedExercise,
  type UserPlaybackUrlResponse,
} from "@yconic/shared-types";
import { and, eq } from "drizzle-orm";
import { ApiError, notFound } from "../common/errors";
import type { ApiConfig } from "../config";
import { loadContents } from "../content/content.store";
import { CONFIG, DB } from "../tokens";

/**
 * 사용자(시청자) 화면용 API. 로그인 없이 쓸 수 있고, 공개 중(PUBLISHED)인 콘텐츠만 내보낸다.
 * 내부 메모·검수 의견·작성자 같은 칸은 toPublishedExercise 가 걸러 낸다.
 */
@Controller()
export class PublicController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: ApiConfig,
  ) {}

  @Get("health")
  health() {
    return { ok: true };
  }

  @Get("exercises")
  async list(@Query("category") category?: string, @Query("keyword") keyword?: string): Promise<PublishedExercise[]> {
    if (category && !EXERCISE_CATEGORIES.includes(category as ExerciseCategory)) throw new ApiError("VALIDATION", "분류 값이 올바르지 않습니다.");
    const filter: ExerciseListFilter = {
      category: (category || undefined) as ExerciseCategory | undefined,
      keyword: typeof keyword === "string" ? keyword.slice(0, 100) : undefined,
    };
    const rows = await loadContents(this.db, this.config, eq(contents.status, "PUBLISHED"));
    return rows.filter((c) => matchesExerciseFilter(c, filter)).map(toPublishedExercise);
  }

  @Get("exercises/:id")
  async get(@Param("id") id: string): Promise<PublishedExercise> {
    const [c] = await loadContents(this.db, this.config, and(eq(contents.id, id), eq(contents.status, "PUBLISHED")));
    if (!c) throw notFound("운동");
    return toPublishedExercise(c);
  }

  @Get("videos/:id/playback-url")
  async playbackUrl(@Param("id") videoId: string): Promise<UserPlaybackUrlResponse> {
    const [c] = await loadContents(this.db, this.config, and(eq(contents.videoId, videoId), eq(contents.status, "PUBLISHED")));
    if (!c) throw notFound("영상");
    return { videoId, url: c.video.url };
  }
}
