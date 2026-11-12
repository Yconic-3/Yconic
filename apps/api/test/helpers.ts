import "reflect-metadata";
import { connectDatabase, type DatabaseConnection } from "@yconic/database";
import { seedDatabase } from "@yconic/database/seed";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inject } from "vitest";
import type { AiModel } from "@yconic/ai-common";
import type { VideoAnalyzer } from "@yconic/content-analysis";
import { loadConfig, type ApiConfig } from "../src/config";
import { createApp } from "../src/create-app";
import { WorkerService } from "../src/worker/worker.service";

export interface TestServer {
  app: NestExpressApplication;
  config: ApiConfig;
  conn: DatabaseConnection;
  baseUrl: string;
  /** 작업기를 한 번 돌린다. ms만큼 시간이 지난 것으로 계산한다. */
  runWorker(afterMs?: number): Promise<void>;
  /** 실제(느린) 분석기로 돌던 작업이 모두 끝날 때까지 기다린다 */
  waitWorker(): Promise<void>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function startTestServer(opts: { ai?: AiModel | null; analyzer?: VideoAnalyzer } = {}): Promise<TestServer> {
  const storageDir = mkdtempSync(join(tmpdir(), "yconic-api-storage-"));
  // 작업기는 자동으로 돌지 않게 하고, 테스트가 runWorker로 직접 돌린다.
  const config = loadConfig({ port: 0, storageDir, jobStageMs: 1000, ttsMs: 1000, workerIntervalMs: 0, webOrigins: ["http://localhost:3000"] });
  const conn = connectDatabase(inject("databaseUrl"));
  const app = await createApp({ config, db: conn.db, quiet: true, ai: opts.ai ?? null, analyzer: opts.analyzer });
  await app.listen(0, "127.0.0.1");
  const baseUrl = (await app.getUrl()).replace("[::1]", "localhost");
  config.publicUrl = baseUrl;
  const worker = app.get(WorkerService);
  return {
    app,
    config,
    conn,
    baseUrl,
    runWorker: (afterMs = 0) => worker.tick(Date.now() + afterMs),
    waitWorker: () => worker.idle(),
    reset: () => seedDatabase(conn.db),
    async close() {
      await app.close();
      await conn.close();
      rmSync(storageDir, { recursive: true, force: true });
    },
  };
}

export interface Res<T = any> {
  status: number;
  body: T;
}

export function client(baseUrl: string, token?: string) {
  async function call<T = any>(method: string, path: string, body?: unknown): Promise<Res<T>> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload: FormData | string | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: payload });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }
  return {
    get: <T = any>(p: string) => call<T>("GET", p),
    post: <T = any>(p: string, b?: unknown) => call<T>("POST", p, b),
    patch: <T = any>(p: string, b?: unknown) => call<T>("PATCH", p, b),
    put: <T = any>(p: string, b?: unknown) => call<T>("PUT", p, b),
    del: <T = any>(p: string) => call<T>("DELETE", p),
  };
}

export async function login(baseUrl: string, email: string, password: string) {
  const res = await client(baseUrl).post("/auth/login", { email, password });
  if (res.status !== 200) throw new Error(`로그인 실패: ${JSON.stringify(res.body)}`);
  return client(baseUrl, res.body.token);
}
