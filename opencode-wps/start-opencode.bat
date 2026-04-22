@echo off
cd /d %1
opencode.exe serve --port 14096 --hostname 127.0.0.1 --cors file://
