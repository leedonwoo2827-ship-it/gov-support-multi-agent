@echo off
setlocal
echo Re-seeding fixture data (20 sample programs)...
call pnpm --filter @gov/orchestrator run seed
echo.
pause
endlocal
