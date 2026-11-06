# admin-web — 관리자 웹

운동 콘텐츠를 AI로 제작하고, 검수·승인해서 사용자에게 공개하는 관리자 화면이다.

## 실행

```bash
pnpm install
```

```bash
pnpm dev:admin
```

http://localhost:3001 에서 열린다. 백엔드 없이 **모의 데이터 모드**로 동작하며,
로그인 화면에서 역할(편집자·승인권자·최고 관리자·조회자)을 골라 들어간다.
데이터는 브라우저 localStorage에 저장되고, 왼쪽 아래 "데이터 초기화"로 되돌릴 수 있다.

## 화면

| 경로 | 내용 |
| --- | --- |
| `/login` | 역할 선택 로그인 (모의 모드) |
| `/` | 대시보드: 상태별 개수, 내가 처리할 콘텐츠, 진행 중 작업 |
| `/contents` | 콘텐츠 목록, 상태 필터, 검색 |
| `/contents/[id]` | 콘텐츠 편집, 검사 결과, 음성 생성, 검수·승인·공개 |
| `/jobs` | AI 제작 작업 목록과 진행률, 실패 재시도 |
| `/jobs/new` | 영상 올리고 제작 요청 |
| `/audit` | 감사 로그 (최고 관리자) |

## 구조

```
src/
├── app/              # Next.js 페이지 (모두 클라이언트 컴포넌트)
├── components/       # 공통 UI, 콘텐츠 편집기, 상태 변경 버튼, 검사 결과
└── lib/
    ├── api/
    │   ├── admin-api.ts        # AdminApi 인터페이스 (화면은 이것만 사용)
    │   ├── http-admin-api.ts   # 백엔드 HTTP 구현 (api 준비 후 사용)
    │   └── mock/               # 모의 구현: 시드 데이터, AI 초안 생성, 상태 보관
    ├── session.tsx   # 로그인 상태와 AdminApi 제공
    └── use-async.ts  # 데이터 로딩·폴링 훅
```

권한표, 상태 전이 규칙, 콘텐츠 검사 규칙은 `@yconic/shared-types`에서 가져온다.
모의 구현도 같은 규칙으로 거절하므로, 버튼을 숨기는 것과 별개로 실제 요청이 막히는지 확인할 수 있다.

## 백엔드 연결

`.env.example`을 `.env.local`로 복사하고 모드를 바꾼다.

```
NEXT_PUBLIC_ADMIN_API_MODE=http
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

필요한 엔드포인트 목록은 `packages/shared-types/src/admin-api.ts` 주석에 있다.
인증 방식이 정해지면 `http-admin-api.ts`의 토큰 전달 부분과 로그인 화면을 바꾼다.

## 테스트

```bash
pnpm --filter @yconic/admin-web test
```

모의 구현의 권한 검사, 검수 흐름, 제작 작업 진행, 음성 생성을 검증한다.

## 아직 없는 것

- 관리자 AI 에이전트 대화 화면 (`apps/admin-agent`와 함께 다음 단계)
- 실제 영상 업로드와 미리보기 (S3 호환 스토리지 연결 후)
- 음성 파일 재생 (TTS 결과 URL이 실제가 되면 추가)
