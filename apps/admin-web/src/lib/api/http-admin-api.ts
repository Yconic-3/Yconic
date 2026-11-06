import type { AdminApiErrorBody } from "@yconic/shared-types";
import { AdminApiError, type AdminApi } from "./admin-api";

/**
 * 백엔드(apps/api)가 준비되면 사용하는 HTTP 구현.
 * 엔드포인트는 @yconic/shared-types 의 admin-api.ts 주석에 정리되어 있다.
 * 인증 방식이 정해지면 getToken 으로 토큰을 넣는다.
 */
export function createHttpAdminApi(baseUrl: string, getToken: () => string | null = () => null): AdminApi {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken();
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as AdminApiErrorBody | null;
      throw new AdminApiError(err?.code ?? "UNKNOWN", err?.message ?? `요청 실패 (${res.status})`);
    }
    return (await res.json()) as T;
  }

  const qs = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return {
    listContents: (f = {}) => request("GET", `/admin/contents${qs({ status: f.status, query: f.query })}`),
    getContent: (id) => request("GET", `/admin/contents/${encodeURIComponent(id)}`),
    updateContent: (id, input) => request("PATCH", `/admin/contents/${encodeURIComponent(id)}`, input),
    changeContentStatus: (id, input) => request("POST", `/admin/contents/${encodeURIComponent(id)}/actions`, input),
    requestTts: (id, input) => request("POST", `/admin/contents/${encodeURIComponent(id)}/tts`, input),
    listJobs: () => request("GET", "/admin/content-jobs"),
    createJob: (input) => request("POST", "/admin/content-jobs", input),
    retryJob: (id) => request("POST", `/admin/content-jobs/${encodeURIComponent(id)}/retry`),
    listAuditLogs: (f = {}) => request("GET", `/admin/audit-logs${qs({ targetId: f.targetId })}`),
  };
}
