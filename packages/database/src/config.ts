/**
 * 개발용 데이터베이스 설정.
 * 이 값은 내 컴퓨터 안에서만 쓰는 개발용이다. 서버에 올릴 때는 DATABASE_URL 환경 변수로 바꾼다.
 */
export const DEV_DB = {
  host: "localhost",
  // 컴퓨터에 따로 설치된 PostgreSQL(기본 5432)과 부딪히지 않도록 5433을 쓴다.
  port: Number(process.env.YCONIC_DB_PORT ?? 5433),
  user: "yconic",
  password: "yconic",
  database: "yconic",
} as const;

export function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    `postgres://${DEV_DB.user}:${DEV_DB.password}@${DEV_DB.host}:${DEV_DB.port}/${DEV_DB.database}`
  );
}
