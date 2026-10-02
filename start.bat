@echo off
echo ========================================================
echo Starting Synapse AI (Autonomous Multi-Agent Intelligence)
echo ========================================================

echo Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "Backend - FastAPI" cmd /k "cd backend && .venv\Scripts\python.exe -m uvicorn src.main:app --host 127.0.0.1 --port 8000 --reload"

timeout /t 2 /nobreak >nul

echo Starting React Frontend on http://localhost:5173 ...
start "Frontend - Vite" cmd /k "cd frontend && npm run dev"

echo All services launched!
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
pause
