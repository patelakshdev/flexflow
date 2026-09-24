@echo off
title FlexFlow - Gym Management System
color 0A
echo.
echo  ███████╗██╗     ███████╗██╗  ██╗███████╗██╗      ██████╗ ██╗    ██╗
echo  ██╔════╝██║     ██╔════╝╚██╗██╔╝██╔════╝██║     ██╔═══██╗██║    ██║
echo  █████╗  ██║     █████╗   ╚███╔╝ █████╗  ██║     ██║   ██║██║ █╗ ██║
echo  ██╔══╝  ██║     ██╔══╝   ██╔██╗ ██╔══╝  ██║     ██║   ██║██║███╗██║
echo  ██║     ███████╗███████╗██╔╝ ██╗██║     ███████╗╚██████╔╝╚███╔███╔╝
echo  ╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
echo.
echo  Premium Gym Management System - Starting up...
echo  ================================================
echo.

REM Start MySQL (XAMPP)
echo [1/3] Starting MySQL database...
start /MIN "MySQL" "C:\xampp\mysql_start.bat"
timeout /t 8 /nobreak > nul

REM Check if MySQL is running
"C:\xampp\mysql\bin\mysql.exe" -u root -e "SELECT 1;" > nul 2>&1
if errorlevel 1 (
    echo  ERROR: MySQL failed to start. Please start XAMPP MySQL manually.
    echo  Then run: npm start
    pause
    exit /b 1
)
echo  MySQL is running!

REM Setup database if needed
echo [2/3] Checking database...
"C:\xampp\mysql\bin\mysql.exe" -u root -e "CREATE DATABASE IF NOT EXISTS flexflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" > nul 2>&1
"C:\xampp\mysql\bin\mysql.exe" -u root flexflow -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='flexflow';" > nul 2>&1
if errorlevel 1 (
    echo  Setting up database schema...
    "C:\xampp\mysql\bin\mysql.exe" -u root flexflow < database\schema.sql
) else (
    echo  Database ready!
)

REM Start Node.js server
echo [3/3] Starting FlexFlow server...
echo.
echo  ================================================
echo   FlexFlow is running!
echo.
echo   Member/Trainer Portal: http://localhost:3000
echo   Admin Portal:          http://localhost:3000/admin
echo.
echo   Admin Login:
echo   Email:    admin@flexflow.com
echo   Password: Admin@123456
echo  ================================================
echo.

node server.js
