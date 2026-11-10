import { describe, expect, it } from "vitest";
import { goBack, goHome, INITIAL_NAV, isHome, navigate, type View } from "./navigation";

const list: View = { name: "list", category: "STRETCHING", keyword: null };
const neck: View = { name: "exercise", exerciseId: "c-neck" };

describe("화면 이동", () => {
  it("다른 화면으로 가면 지나온 화면을 쌓는다", () => {
    const state = navigate(navigate(INITIAL_NAV, list), neck);
    expect(state.current).toEqual(neck);
    expect(state.history).toEqual([{ name: "home" }, list]);
  });

  it("같은 화면으로 가면 쌓지 않는다", () => {
    const once = navigate(INITIAL_NAV, list);
    expect(navigate(once, { ...list })).toBe(once);
  });

  it("이전 화면으로 한 단계씩 돌아간다", () => {
    const state = navigate(navigate(INITIAL_NAV, list), neck);
    const back = goBack(state);
    expect(back.current).toEqual(list);
    expect(goBack(back).current).toEqual({ name: "home" });
  });

  it("지나온 화면이 없으면 홈으로 간다", () => {
    expect(goBack(INITIAL_NAV)).toEqual(INITIAL_NAV);
  });

  it("홈으로 가면 지나온 화면을 비운다", () => {
    expect(goHome().history).toEqual([]);
    expect(isHome(goHome())).toBe(true);
    expect(isHome(navigate(INITIAL_NAV, list))).toBe(false);
  });
});
