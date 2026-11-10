# Yconic — 시각장애인 AI 운동 지원 플랫폼

이 파일은 Claude Code가 이 저장소를 열 때 자동으로 읽는 프로젝트 안내서다.
팀원 누가 열어도 같은 기준으로 작업하도록 여기에 규칙을 모은다.

## 프로젝트 개요

- 시각장애인이 음성 중심으로 운동 콘텐츠를 찾고 수행할 수 있도록 돕는 플랫폼
- 설계 기준 문서: `ai-agent-architecture.md` (구조·역할·기술 스택·보안 원칙)
- 설계 문서와 충돌하는 구현을 하기 전에는 반드시 사용자에게 먼저 확인한다

## 현재 상태

- 아직 코드는 없고, 설계 문서와 협업 환경 설정만 있다
- 다음 단계: pnpm + Turborepo 모노레포 초기화 (`apps/`, `packages/` 구조는 설계 문서 2장 참고)

## 작업 규칙

- 대화와 문서, 커밋 메시지는 한국어로 작성한다
- 모든 텍스트 파일은 UTF-8, 줄바꿈은 LF로 저장한다 (`.gitattributes`, `.editorconfig`가 강제한다)
- 커밋 메시지: `타입: 내용` 형식 (예: `feat: 운동 검색 API 추가`, `docs: 설계 문서 수정`)
  - 타입: feat, fix, docs, chore, refactor, test, style
- main 브랜치에 직접 푸시하지 않고 작업 브랜치 → PR → 리뷰 후 병합한다
  - 브랜치 이름: `feat/기능명`, `fix/버그명`, `docs/문서명`
- 민감한 값(API 키 등)은 `.env`에만 두고 커밋하지 않는다 (`.env.example`에 키 이름만 기록)

## 팀 소통

- 작업 요청·질문·결정 사항은 GitHub Issues에 남긴다 (VS Code의 GitHub Pull Requests 확장에서 바로 작성 가능)
- 가벼운 공지나 메모는 `docs/TEAM_BOARD.md`에 날짜·이름과 함께 추가한다
- 큰 설계 결정은 `docs/decisions/`에 번호를 붙여 기록한다
- 자세한 절차는 `docs/CONTRIBUTING.md` 참고

## Claude Code 사용 시

- 작업 시작 전 `git pull`로 최신 상태를 받는다
- 다른 사람이 수정 중인 파일을 함께 고칠 때는 Issue나 TEAM_BOARD에서 먼저 조율한다
- 개인 전용 설정은 `.claude/settings.local.json`에 두고 커밋하지 않는다 (`.gitignore`에 포함)
- 팀 공유 권한 설정의 예시는 `docs/claude-settings.example.json`에 있다. `.claude/settings.json`으로 복사하면 적용된다
