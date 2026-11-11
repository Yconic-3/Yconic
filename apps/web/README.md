# web — 사용자 화면 + 관리자 화면

하나의 Next.js 웹앱에 두 화면이 들어 있다 (결정 기록: `docs/decisions/0004-한-웹앱으로-합치기.md`).

| 주소 | 화면 | 코드 | 자세한 문서 |
| --- | --- | --- | --- |
| `/` | 사용자 화면 (말벗핏): 말로 운동을 찾고 구간별 음성 안내를 들으며 운동 | `src/user`, `src/app/(user)` | [docs/user.md](docs/user.md) |
| `/exercises/{id}` | 운동 화면: 그 운동의 영상, 단계 카드, 지금 안내 중 막대 | 위와 같음 (`src/app/(user)/(assistant)`) | [docs/user.md](docs/user.md) |
| `/login` | 로그인 (사용자·관리자 공통) | `src/app/(user)/login`, `src/mock/auth.ts` | 아래 "로그인" |
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

## 로그인

- 처음 화면 오른쪽 위 **로그인**에서 계정으로 로그인한다. 로그인은 사용자 화면과 관리자 화면이 같은 것을 쓴다.
- 관리자 계정으로 로그인하면 처음 화면에 **관리자 페이지** 버튼이 생긴다. 처음 화면 맨 아래 **관리자 페이지로 가기**는 누구나 볼 수 있고, 로그인하지 않았으면 관리자 로그인으로 보낸다.
- 일반 회원으로 `/admin`에 가면 관리자 계정이 필요하다는 안내와 함께 로그인 화면으로 간다.
- 지금은 모의 로그인이다 (`src/mock/auth.ts`). 로그인 화면의 "체험용 계정"을 누르면 바로 들어간다.

| 계정 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 체험 회원 (일반) | member@example.com | member1234 |
| 김편집 (편집자) | editor@example.com | editor1234 |
| 이승인 (승인권자) | approver@example.com | approver1234 |
| 박관리 (최고 관리자) | super@example.com | super1234 |
| 최조회 (조회자) | viewer@example.com | viewer1234 |

시연용 값이다. 서버 검증이 없어 보안 수단이 아니며, 백엔드 인증이 정해지면 바꾼다.

## 구조

```
src/
├── app/
│   ├── layout.tsx        # 공통 껍데기 (html, body)
│   ├── globals.css       # 색 토큰, .user-root / .admin-root 영역별 스타일
│   ├── (user)/
│   │   ├── (assistant)/  # / 와 /exercises/[id]. 레이아웃에 비서 화면이 있어 주소가 바뀌어도 마이크·대화가 이어진다
│   │   └── login/        # 로그인 (사용자·관리자 공통)
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

- 지금은 모의 로그인이다. 실제 인증이 붙으면 `/admin` 아래 전체를 서버에서 막아야 한다. 지금은 화면에서만 막고 있다.
