@echo off
rem 소리벗을 임시 공개 링크(https)로 연다. 먼저 실행하기.cmd 로 개발 서버를 켜 둔다.
rem 이 창을 닫거나 Ctrl+C 를 누르면 링크가 닫힌다. 다시 켜면 주소가 바뀐다.
chcp 65001 >nul
cd /d "%~dp0"
set "PNPM=pnpm"
where pnpm >nul 2>nul || set "PNPM=%APPDATA%\npm\pnpm.cmd"
call "%PNPM%" share
pause
