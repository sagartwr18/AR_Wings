$VenvPy = "$PSScriptRoot\..\..\Gender Detector Project\backend\venv\Scripts\python.exe"
$LocalVenvPy = "$PSScriptRoot\backend\venv\Scripts\python.exe"

if (Test-Path $VenvPy) {
    Write-Host "[OK] Using Gender Detector Python environment..." -ForegroundColor Green
    & $VenvPy "$PSScriptRoot\backend\main.py"
} elseif (Test-Path $LocalVenvPy) {
    Write-Host "[OK] Using local virtual environment..." -ForegroundColor Green
    & $LocalVenvPy "$PSScriptRoot\backend\main.py"
} else {
    Write-Host "[WARN] Virtual environment not found, falling back to system python..." -ForegroundColor Yellow
    python "$PSScriptRoot\backend\main.py"
}
