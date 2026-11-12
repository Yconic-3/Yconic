import { createFixtures, FIXTURE_ACCOUNTS } from "@yconic/fixtures";
import { sql } from "drizzle-orm";
import type { Database } from "./index";
import { hashPassword } from "./password";
import { accounts, auditLogs, contentJobs, contents, segments, videos } from "./schema";

/**
 * 처음 데이터를 넣는다 (웹앱 모의 모드와 같은 예시 데이터, @yconic/fixtures).
 * 이미 있는 데이터는 모두 지우고 새로 넣는다. 개발용이다.
 */
export async function seedDatabase(db: Database, nowMs = Date.now()): Promise<void> {
  const f = createFixtures(nowMs);
  const accountRows = await Promise.all(
    FIXTURE_ACCOUNTS.map(async (a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      passwordHash: await hashPassword(a.password),
      adminRole: a.adminRole,
    })),
  );

  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table audit_logs, content_jobs, segments, contents, videos, account_courses, account_movements, personalized_guides, auth_sessions, accounts restart identity cascade`);

    await tx.insert(accounts).values(accountRows);

    await tx.insert(videos).values(
      f.videos.map((v) => ({
        id: v.id,
        fileName: v.fileName,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        durationSec: v.durationSec,
        width: v.width,
        height: v.height,
        storageKey: null,
        uploadedBy: v.uploadedBy,
        uploadedAt: new Date(v.uploadedAt),
      })),
    );

    await tx.insert(contents).values(
      f.contents.map((c) => ({
        id: c.id,
        title: c.title,
        summary: c.summary,
        category: c.category,
        difficulty: c.difficulty,
        tags: c.tags,
        precautions: c.precautions,
        videoId: c.video.id,
        analysis: c.analysis,
        status: c.status,
        aiGenerated: c.aiGenerated,
        internalNote: c.internalNote,
        reviewComment: c.reviewComment,
        createdBy: c.createdBy,
        submittedBy: c.submittedBy,
        updatedBy: c.updatedBy,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
        publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
        version: c.version,
      })),
    );

    await tx.insert(segments).values(
      f.contents.flatMap((c) =>
        c.segments.map((s, i) => ({
          id: s.id,
          contentId: c.id,
          position: i + 1,
          kind: s.kind,
          startSec: s.startSec,
          endSec: s.endSec,
          title: s.title,
          instruction: s.instruction,
          voiceGuide: s.voiceGuide,
          conciseGuide: s.conciseGuide ?? "",
          movements: s.movements ?? [],
          narration: s.narration ?? [],
          repetitions: s.repetitions,
          ttsStatus: s.tts.status,
          ttsAudioUrl: s.tts.audioUrl,
          ttsGeneratedForText: s.tts.generatedForText,
          ttsFailureReason: s.tts.failureReason,
        })),
      ),
    );

    await tx.insert(contentJobs).values(
      f.jobs.map((j) => ({
        id: j.id,
        kind: j.kind,
        title: j.title,
        category: j.category,
        difficulty: j.difficulty,
        requestNote: j.requestNote,
        videoId: j.video.id,
        status: j.status,
        progress: j.progress,
        failureReason: j.failureReason,
        contentId: j.contentId,
        requestedBy: j.requestedBy,
        createdAt: new Date(j.createdAt),
        updatedAt: new Date(j.updatedAt),
        completedAt: j.completedAt ? new Date(j.completedAt) : null,
        startedAt: new Date(j.startedAtMs),
        simulateFailure: j.simulateFailure,
      })),
    );

    await tx.insert(auditLogs).values(
      f.auditLogs.map((l) => ({
        id: l.id,
        action: l.action,
        actorId: l.actorId,
        actorName: l.actorName,
        actorRole: l.actorRole,
        targetType: l.targetType,
        targetId: l.targetId,
        summary: l.summary,
        createdAt: new Date(l.createdAt),
      })),
    );
  });
}
