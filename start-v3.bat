@echo off
REM =====================================================
REM CYBER AGENT PRO v3.0 ULTIMATE - QUICK LAUNCHER
REM =====================================================

echo.
echo ================================================================
echo    🔥 CYBER AGENT PRO v3.0 ULTIMATE - 10/10 SYSTEM
echo ================================================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js not found! Please install Node.js 18+ first.
    echo    Download: https://nodejs.org/
    pause
    exit /b 1
)

REM Check if .env exists
if not exist ".env" (
    echo ⚠️  .env file not found!
    echo.
    echo Creating .env from .env.example...
    copy .env.example .env
    echo.
    echo ⚠️  IMPORTANT: Please edit .env and add your GEMINI_API_KEY
    echo    Get your key at: https://aistudio.google.com/
    echo.
    pause
)

REM Check GEMINI_API_KEY
findstr /C:"GEMINI_API_KEY=" .env | findstr /V /C:"GEMINI_API_KEY=$" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ GEMINI_API_KEY not configured in .env!
    echo    Please add your Gemini API key first.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ npm install failed!
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed
    echo.
)

REM Check if agents directory exists
if not exist "agents" (
    echo ⚠️  agents/ directory not found!
    echo    Running upgrade script...
    node upgrade-to-10.js
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Upgrade failed!
        pause
        exit /b 1
    )
    echo.
)

echo ✅ All checks passed!
echo.
echo ================================================================
echo    Starting Multi-Agent System...
echo ================================================================
echo.
echo 📋 Available endpoints:
echo    • POST /api/v2/execute       - Main multi-agent execution
echo    • POST /api/v2/fact-check    - Fact-check with grounding
echo    • POST /api/v2/research      - Deep research
echo    • POST /api/v2/benchmark     - Performance benchmark
echo    • GET  /api/v2/stats         - System statistics
echo.
echo 📚 Documentation:
echo    • UPGRADE-SUMMARY.md         - Complete upgrade guide
echo    • V2-QUICK-START.md          - API usage guide
echo    • COMPETITIVE-ANALYSIS.md    - vs Claude/Antigravity
echo.
echo ================================================================
echo.

REM Start server
node server.js

REM If server exits
echo.
echo Server stopped.
pause
