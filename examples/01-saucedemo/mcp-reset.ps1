# mcp-reset.ps1 — limpia procesos huérfanos de Playwright/MCP ANTES de abrir Claude Code.
#
# QUÉ RESUELVE
#   El motor del agente usa un proceso de larga vida, run-test-mcp-server (Playwright Test
#   Agents), que Claude Code arranca al abrir la sesión. Si ese worker nace en mal estado
#   (o queda un zombi de una sesión anterior que crasheó), el planner falla con
#   "two different versions of @playwright/test" / "did not expect test() to be called here"
#   y NO se auto-recupera dentro de la sesión (ni con /mcp reconnect).
#
# CÓMO USARLO  (con Claude Code CERRADO — este script mata el worker; si Claude Code está
#              abierto, matarías el que está usando):
#   1. Cierra Claude Code / VSCode por completo.
#   2. En una terminal, desde la raíz del template:
#        powershell -ExecutionPolicy Bypass -File examples/01-saucedemo/mcp-reset.ps1
#   3. Abre Claude Code en la carpeta del template y lanza el lab. El worker nace limpio.
#
# SEGURIDAD: NO mata Node en general (eso mataría Claude Code). Solo mata:
#   - procesos node cuya línea de comando contiene "run-test-mcp-server" (el worker MCP)
#   - navegadores lanzados por Playwright (ruta bajo "ms-playwright" / headless_shell)
#   Tu Chrome/Edge normal y el resto de Node quedan intactos.

$ErrorActionPreference = 'SilentlyContinue'
Write-Host "[mcp-reset] Limpiando procesos huerfanos de Playwright/MCP..." -ForegroundColor Cyan

# 1) Worker(s) run-test-mcp-server (node)
$mcp = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*run-test-mcp-server*' }
if ($mcp) {
  foreach ($p in $mcp) {
    Write-Host ("  - run-test-mcp-server  PID {0}" -f $p.ProcessId)
    Stop-Process -Id $p.ProcessId -Force
  }
} else {
  Write-Host "  - run-test-mcp-server: ninguno"
}

# 2) Navegadores de Playwright (cache ms-playwright) + headless_shell
$browsers = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*ms-playwright*' }
$count = 0
if ($browsers) {
  foreach ($b in $browsers) { Stop-Process -Id $b.ProcessId -Force; $count++ }
}
Get-Process headless_shell | ForEach-Object { Stop-Process -Id $_.Id -Force; $count++ }
Write-Host ("  - navegadores Playwright: {0} cerrados" -f $count)

Write-Host "[mcp-reset] Listo. Abre Claude Code en el template y lanza el lab (worker limpio)." -ForegroundColor Green
