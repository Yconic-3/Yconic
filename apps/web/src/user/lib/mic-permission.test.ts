import { describe, expect, it } from "vitest";
import { micPermissionText, type MicPermission } from "./mic-permission";

describe("마이크 권한 안내", () => {
  it("묻기 전이면 허용 버튼과 '허용을 누르세요' 안내를 준다", () => {
    const t = micPermissionText("prompt");
    expect(t.canRequest).toBe(true);
    expect(t.help).toMatch(/허용을 누르세요/);
  });

  it("차단됐으면 브라우저 설정에서 다시 허용하는 방법을 알려 준다", () => {
    expect(micPermissionText("denied").help).toMatch(/자물쇠.*마이크를 허용/);
  });

  it("허용됐거나 쓸 수 없는 환경이면 버튼을 보여 주지 않는다", () => {
    const noButton: MicPermission[] = ["granted", "insecure", "unsupported"];
    for (const s of noButton) expect(micPermissionText(s).canRequest).toBe(false);
  });

  it("쓸 수 없을 때는 글 입력을 대신 쓰라고 안내한다", () => {
    for (const s of ["denied", "no-device", "insecure", "unsupported"] as MicPermission[]) {
      expect(micPermissionText(s).help).toMatch(/글로 입력/);
    }
  });
});
