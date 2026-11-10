# 참여 가이드 (CONTRIBUTING)

이 문서는 Yconic 저장소에서 함께 개발하기 위한 절차를 정리한 것이다.
처음 참여하는 사람은 아래 "시작하기"부터 순서대로 따라 하면 된다.

## 1. 시작하기

### 필수 설치

| 도구 | 버전 | 비고 |
| --- | --- | --- |
| Git | 최신 | https://git-scm.com |
| Node.js | 24 이상 | https://nodejs.org (LTS) |
| pnpm | 최신 | `npm install -g pnpm` |
| VS Code | 최신 | https://code.visualstudio.com |
| Claude Code | 최신 | VS Code 확장 또는 데스크톱 앱 |

### 저장소 받기

```bash
git clone https://github.com/Yconic-3/Yconic.git
```

```bash
cd Yconic
```

### VS Code에서 열기

1. VS Code로 `Yconic` 폴더를 연다.
2. 오른쪽 아래에 "이 저장소에 권장 확장이 있습니다" 알림이 뜨면 **모두 설치**를 누른다.
   (알림이 안 뜨면 확장 탭에서 `@recommended`를 검색한다.)
3. 설치되는 확장:
   - **Claude Code** — AI 개발 도우미. 저장소의 `CLAUDE.md`를 자동으로 읽어 같은 규칙으로 작업한다.
   - **GitHub Pull Requests and Issues** — VS Code 안에서 이슈 작성·PR 리뷰·댓글을 주고받는다.
   - **Live Share** — 실시간 코드 공동 편집과 채팅.
   - **GitLens** — 누가 어떤 줄을 언제 바꿨는지 표시.
   - **EditorConfig / Prettier / ESLint** — 코드 스타일 자동 통일.
4. GitHub 확장에 로그인한다. (왼쪽 Accounts 아이콘 → Sign in with GitHub)

### Claude Code로 열기

Claude Code 데스크톱 앱이나 VS Code 확장에서 이 폴더를 열면 `CLAUDE.md`와
`.claude/settings.json`이 자동으로 적용되어 모든 팀원이 같은 환경으로 작업한다.

## 2. 서로 소통하는 방법

### 작업 요청 · 질문 · 버그 → GitHub Issues

- VS Code 왼쪽 GitHub 아이콘 → **Issues** → `+` 버튼으로 새 이슈 작성.
- 이슈 제목 앞에 종류를 붙인다: `[작업]`, `[질문]`, `[버그]`, `[논의]`
- 담당자(Assignee)를 지정하면 그 사람에게 GitHub 알림이 간다.
- 코드 안에 `// TODO:` 또는 `// 질문:` 주석을 쓰면 그 위에 "Create Issue" 링크가 떠서 바로 이슈로 만들 수 있다.

### 코드 리뷰 · 댓글 → Pull Request

- PR을 올리면 팀원이 VS Code 안에서 특정 줄에 댓글을 달 수 있다.
- 댓글 알림은 GitHub 알림과 이메일로 간다.

### 실시간 같이 작업 → Live Share

- VS Code 왼쪽 아래 **Live Share** 버튼 → 링크 복사 → 팀원에게 전달.
- 참여자는 같은 파일을 동시에 편집하고, 세션 안 채팅으로 대화할 수 있다.

### 가벼운 공지 · 메모 → `docs/TEAM_BOARD.md`

- GitHub 로그인 없이도 읽고 쓸 수 있는 저장소 안 게시판.
- 맨 위에 날짜, 이름, 내용을 추가하고 커밋한다.

### 큰 설계 결정 → `docs/decisions/`

- 기술 선택, 구조 변경 같은 결정은 `docs/decisions/0001-제목.md` 형식으로 남긴다.

## 3. 작업 흐름

1. **최신 상태 받기**

```bash
git pull origin main
```

2. **작업 브랜치 만들기** (main에 직접 커밋하지 않는다)

```bash
git checkout -b feat/기능이름
```

3. **작업 후 커밋** — 메시지는 `타입: 내용` 형식

```bash
git commit -m "feat: 운동 검색 화면 추가"
```

| 타입 | 용도 |
| --- | --- |
| feat | 새 기능 |
| fix | 버그 수정 |
| docs | 문서 |
| chore | 설정, 빌드, 잡일 |
| refactor | 동작 변화 없는 구조 개선 |
| test | 테스트 |
| style | 포맷, 공백 등 |

4. **푸시하고 PR 열기**

```bash
git push -u origin feat/기능이름
```

VS Code GitHub 확장 → Pull Requests → **Create Pull Request**.

5. **리뷰 후 병합** — 한 명 이상의 승인을 받고 main에 병합한다.

## 4. 지켜야 할 것

- 파일 인코딩은 UTF-8, 줄바꿈은 LF. (설정 파일이 자동으로 맞춰준다)
- API 키, 비밀번호는 `.env`에만 두고 절대 커밋하지 않는다.
- 다른 사람이 작업 중인 파일을 고칠 때는 이슈나 TEAM_BOARD에서 먼저 알린다.
- 설계 문서(`ai-agent-architecture.md`)와 다른 구조로 만들 때는 먼저 `[논의]` 이슈를 연다.
