# api — 백엔드 API (NestJS)

사용자 화면과 관리자 화면(`apps/web`)이 쓰는 서버다. 포트 4000. 결정 기록: `docs/decisions/0005-데이터베이스와-API-구성.md`

## 실행

처음 한 번은 데이터베이스를 켜고 테이블과 예시 데이터를 넣는다.

```bash
pnpm db:start
```

다른 터미널에서:

```bash
pnpm db:setup
```

```bash
pnpm dev:api
```

http://localhost:4000/health 가 `{"ok":true}`이면 켜진 것이다. 웹앱(`pnpm dev:web`)은 기본으로 이 서버를 쓴다.
설정을 바꾸려면 `.env.example`을 `.env`로 복사해 고친다.

## 주소

요청·응답 모양은 `packages/shared-types`에 있다. 오류는 모두 `{ code, message }` 모양이다.

| 묶음 | 주소 | 로그인 | 계약 |
| --- | --- | --- | --- |
| 로그인 | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | `me`, `logout`만 | `auth.ts` |
| 사용자 화면 | `GET /exercises`, `GET /exercises/:id`, `GET /videos/:id/playback-url` | 없음 (공개 중인 운동만) | `user-api.ts` |
| 관리자 화면 | `/admin/...` (영상, 콘텐츠, 검수·공개, 음성, AI 제작 작업, 감사 로그) | 관리자 계정 | `admin-api.ts` |
| 회원 콘텐츠 올리기 | `/me/videos`, `/me/content-jobs`, `/me/contents` (안내 고치기, 검수 요청) | 로그인한 회원 누구나 (자기 것만) | `creator-api.ts` |
| 내 강의 | `GET/PUT /me/courses` | 로그인한 회원 | `courses.ts` |
| 영상 파일 | `GET /media/videos/:파일` | 없음 (임시) | |

로그인이 필요한 요청은 `Authorization: Bearer <token>` 헤더를 붙인다. 없거나 만료되면 401, 관리자가 아니거나 역할 권한이 없으면 403.

## 구조

```
src/
├── main.ts              # 서버 시작 (.env 읽기, DB 연결)
├── create-app.ts        # 서버 만들기 (테스트도 같이 씀)
├── app.module.ts        # 컨트롤러·서비스 묶음, 업로드 설정
├── auth/                # 로그인, 로그인 확인(AuthGuard)·관리자 확인(AdminGuard)
├── public/              # 사용자 화면 API
├── admin/               # 관리자 화면 API (validate.ts: 요청 모양 검사)
├── content/             # DB 행 ↔ 화면 모양 변환, 감사 로그 쓰기
├── worker/              # 제작 작업기: 작업 단계 진행, 초안 만들기, 다시 분석, 음성 생성 (모의)
└── common/              # 오류 형식, ID 만들기
test/                    # 실제 HTTP로 확인하는 테스트 (쓰고 버리는 PostgreSQL)
```

- NestJS의 의존성 주입은 생성자마다 `@Inject(...)`를 직접 적는다 (tsx/vitest가 타입 정보를 만들지 않기 때문).
- 규칙(권한표, 상태 전이, 자기 승인 금지)은 직접 만들지 말고 `@yconic/shared-types` 함수를 쓴다.
- 작업기는 지금 API 서버 안에서 1초마다 돈다. 단계마다 걸리는 시간은 `JOB_STAGE_MS`, `TTS_MS`로 바꾼다.
  파일 이름에 `fail`이 들어간 영상은 실패를 시연한다.

## 테스트

```bash
pnpm --filter @yconic/api test
```

임시 폴더에 PostgreSQL을 새로 켜서 돌리므로 개발용 DB(5433)는 건드리지 않는다.
이미 있는 DB를 쓰려면 `TEST_DATABASE_URL`을 지정한다 (CI가 이렇게 한다). 그 DB의 데이터는 지워진다.
