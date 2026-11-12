import { describe, expect, it } from "vitest";
import { eulReul, ieyo } from "./korean";

describe("조사", () => {
  it("받침에 따라 을/를, 이에요/예요를 고른다", () => {
    expect(eulReul("의자 잡고 스쿼트")).toBe("의자 잡고 스쿼트를");
    expect(eulReul("제자리 걷기")).toBe("제자리 걷기를");
    expect(eulReul("벽 밀기 상체 운동")).toBe("벽 밀기 상체 운동을");
    expect(ieyo("스쿼트")).toBe("스쿼트예요");
    expect(ieyo("목 스트레칭")).toBe("목 스트레칭이에요");
  });
});
