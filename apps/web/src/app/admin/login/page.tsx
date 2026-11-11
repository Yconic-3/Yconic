"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 예전 관리자 로그인 주소. 이제 로그인은 /login 한 곳에서 한다. */
export default function AdminLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login?next=/admin");
  }, [router]);
  return (
    <p className="p-8 text-sm text-slate-500" role="status">
      로그인 화면으로 이동하는 중…
    </p>
  );
}
