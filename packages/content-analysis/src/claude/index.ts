/**
 * 서버 전용 실제 분석기 (ffmpeg, Python, Claude를 쓴다). 웹앱은 이 경로를 가져오지 않는다.
 *   import { createClaudeVideoAnalyzer, createLocalMediaTools } from "@yconic/content-analysis/claude";
 */
export { ANALYSIS_SCHEMA, createClaudeVideoAnalyzer, normalizeSegments, type ClaudeAnalyzerDeps } from "./analyzer";
export { createLocalMediaTools, frameInterval, type Frame, type LocalMediaOptions, type MediaTools, type TranscriptLine } from "./media";
