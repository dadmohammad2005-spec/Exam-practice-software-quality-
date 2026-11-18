@echo off
title SQE Exam Browser Launcher
cls
echo ====================================================================
echo     SQE Master - Software Quality Engineering Exam Browser
echo ====================================================================
echo.
echo Launching SQE Exam Browser in your default web browser...
echo.
start "" "%~dp0index.html"
echo The Exam Browser is now open!
echo You can practice 245 verified MCQs with timer, explanations, and tracking.
echo.
timeout /t 3 >nul
exit
