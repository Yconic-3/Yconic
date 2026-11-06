"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** 다시 불러온다. silent면 로딩 표시 없이 조용히 갱신한다. */
  reload(opts?: { silent?: boolean }): Promise<void>;
}

/**
 * 비동기 데이터 로딩 훅. deps가 바뀌면 다시 불러오고, 늦게 도착한 이전 응답은 버린다.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    const id = ++seq.current;
    if (!opts?.silent) setLoading(true);
    try {
      const result = await fnRef.current();
      if (id !== seq.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (id !== seq.current) return;
      setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // deps는 호출하는 쪽에서 정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}

/** 조건이 참인 동안 일정 간격으로 reload(silent)를 호출한다. */
export function usePolling(active: boolean, intervalMs: number, reload: AsyncState<unknown>["reload"]) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void reload({ silent: true }), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, reload]);
}
