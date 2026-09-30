@echo off
set "VENV_PY=%~dp0..\..\Gender Detector Project\backend\venv\Scripts\python.exe"
set "LOCAL_VENV=%~dp0backend\venv\Scripts\python.exe"

if exist "%VENV_PY%" (
    echo [OK] Using Gender Detector Python environment...
    "%VENV_PY%" "%~dp0backend\main.py"
) else if exist "%LOCAL_VENV%" (
    echo [OK] Using local virtual environment...
    "%LOCAL_VENV%" "%~dp0backend\main.py"
) else (
    echo [WARN] Virtual environment not found, falling back to system python...
    python "%~dp0backend\main.py"
)
