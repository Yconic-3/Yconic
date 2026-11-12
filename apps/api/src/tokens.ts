/** 의존성 주입 토큰. 클래스가 아닌 값(설정, DB, 분석기)을 주입할 때 쓴다. */
export const CONFIG = Symbol("CONFIG");
export const DB = Symbol("DB");
export const ANALYZER = Symbol("ANALYZER");
/** Claude 연결 (AiModel). API 키가 없으면 null */
export const AI = Symbol("AI");
