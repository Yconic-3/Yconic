# web — 사용자 화면 + 관리자 화면

하나의 Next.js 웹앱에 두 화면이 들어 있다 (결정 기록: `docs/decisions/0004-한-웹앱으로-합치기.md`).

| 주소 | 화면 | 코드 | 자세한 문서 |
| --- | --- | --- | --- |
| `/` | 사용자 화면 (말벗핏): 말로 운동을 찾고 구간별 음성 안내를 들으며 운동 | `src/user`, `src/app/(user)` | [docs/user.md](docs/user.md) |
| `/admin` | 관리자 화면: 영상 업로드, AI 구간 분석, 검수·승인·공개 | `src/admin`, `src/app/admin` | [docs/admin.md](docs/admin.md) |

## 실행

```bash
pnpm install
```

```bash
pnpm dev:web
```

http://localhost:3000 이 사용자 화면, http://localhost:3000/admin 이 관리자 화면이다.

## 두 화면이 데이터를 함께 쓴다

백엔드가 생기기 전에는 `src/mock`의 모의 백엔드가 브라우저 저장소(localStorage, IndexedDB)에 데이터를 둔다.
두 화면이 같은 주소에서 돌아가므로 같은 저장소를 읽는다.

1. 관리자 화면에서 영상을 올리면 AI 초안이 만들어진다.
2. 다른 승인권자가 승인하고 "사용자에게 공개"를 누른다.
3. 사용자 화면을 새로 열면 그 운동이 목록에 나오고, 올린 영상 파일도 재생된다.

처음 상태는 공개 운동 4개와 관리자 흐름 시연용 3개(검수 중·초안·수정 요청)다. 관리자 화면 왼쪽 아래 "데이터 초기화"로 처음 상태로 되돌린다.

## 구조

```
src/
├── app/
│   ├── layout.tsx        # 공통 껍데기 (html, body)
│   ├── globals.css       # 색 토큰, .user-root / .admin-root 영역별 스타일
│   ├── (user)/           # 사용자 화면 페이지 (/)
│   └── admin/            # 관리자 화면 페이지 (/admin/...)
├── user/                 # 사용자 화면 코드 (화면, 말 해석, 재생, UserApi)
├── admin/                # 관리자 화면 코드 (편집기, 타임라인, AdminApi)
└── mock/                 # 두 화면이 함께 쓰는 모의 백엔드와 예시 데이터
```

- 사용자 화면과 관리자 화면은 서로의 화면 코드를 가져다 쓰지 않는다. 함께 쓰는 것은 `src/mock`과 `@yconic/shared-types`뿐이다.
- 사용자 화면은 공개 중인 콘텐츠만, 사용자에게 필요한 칸만 받는다 (`src/user/lib/api/user-api.ts`). 관리자 내부 메모·검수 의견은 넘어가지 않는다.
- 바탕색·글자 크기·초점 표시는 `.user-root`, `.admin-root` 안에서만 적용되어 서로 섞이지 않는다.

## 테스트

```bash
pnpm --filter @yconic/web test
```

## 주의

- 지금 `/admin`은 모의 로그인이다. 실제 인증이 붙으면 `/admin` 아래 전체를 서버에서 막아야 한다. 사용자 화면에서 관리자 화면으로 가는 링크는 일부러 두지 않았다.
