"use client";

import type { ContentIssue } from "@yconic/shared-types";
import { Alert } from "./ui";

export function ValidationPanel({ issues }: { issues: ContentIssue[] }) {
  const errors = issues.filter((i) => i.severity === "ERROR");
  const warnings = issues.filter((i) => i.severity === "WARNING");

  if (issues.length === 0) return <Alert kind="success">누락이나 형식 오류가 없습니다.</Alert>;

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <Alert kind="error">
          <p className="font-medium">검수 요청 전에 고쳐야 합니다 ({errors.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert kind="warning">
          <p className="font-medium">확인이 필요합니다 ({warnings.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((i, idx) => (
              <li key={idx}>{i.message}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
