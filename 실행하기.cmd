@echo off
rem 소리벗 개발 서버를 한 번에 켠다: 데이터베이스, API, AI 에이전트, 웹앱.
rem 이 파일을 더블클릭하면 된다. 끄려면 이 창에서 Ctrl+C 를 누르거나 창을 닫는다.
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  소리벗 개발 서버를 켭니다 - DB, API, AI 에이전트, 웹앱
echo  다 켜지면 브라우저가 http://localhost:3000 을 엽니다.
echo  처음 쓰는 컴퓨터라면 먼저 pnpm install 과 pnpm db:setup 을 한 번 실행하세요.
echo  끄려면 이 창에서 Ctrl+C 를 누르세요.
echo.
start "" /min cmd /c "timeout /t 30 /nobreak >nul && start http://localhost:3000"
rem 이 창이 pnpm을 못 찾으면 npm이 설치한 곳에서 직접 부른다
set "PNPM=pnpm"
where pnpm >nul 2>nul || set "PNPM=%APPDATA%\npm\pnpm.cmd"
call "%PNPM%" dev
pause
