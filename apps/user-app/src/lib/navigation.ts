import type { ExerciseCategory, Id } from "@yconic/shared-types";

/** 앱의 화면. 한 페이지 안에서 바뀌며, 이전 화면으로 돌아갈 수 있게 지나온 화면을 쌓아 둔다. */
export type View =
  | { name: "home" }
  | { name: "list"; category: ExerciseCategory | null; keyword: string | null }
  | { name: "exercise"; exerciseId: Id };

export interface NavState {
  current: View;
  history: View[];
}

export const HOME_VIEW: View = { name: "home" };
export const INITIAL_NAV: NavState = { current: HOME_VIEW, history: [] };

const MAX_HISTORY = 10;

export function sameView(a: View, b: View): boolean {
  if (a.name === "home" && b.name === "home") return true;
  if (a.name === "list" && b.name === "list") return a.category === b.category && a.keyword === b.keyword;
  if (a.name === "exercise" && b.name === "exercise") return a.exerciseId === b.exerciseId;
  return false;
}

/** 다른 화면으로 간다. 같은 화면이면 그대로 둔다. */
export function navigate(state: NavState, next: View): NavState {
  if (sameView(state.current, next)) return state;
  return { current: next, history: [...state.history, state.current].slice(-MAX_HISTORY) };
}

/** 이전 화면으로 돌아간다. 지나온 화면이 없으면 홈으로 간다. */
export function goBack(state: NavState): NavState {
  const previous = state.history[state.history.length - 1];
  if (!previous) return INITIAL_NAV;
  return { current: previous, history: state.history.slice(0, -1) };
}

export function goHome(): NavState {
  return INITIAL_NAV;
}

export function isHome(state: NavState): boolean {
  return state.current.name === "home";
}
