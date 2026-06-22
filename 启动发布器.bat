@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WA Publisher
npm.cmd run publisher
if errorlevel 1 (
  echo.
  echo 发布器启动失败，请把上面的错误信息发给 Codex。
  pause
)
