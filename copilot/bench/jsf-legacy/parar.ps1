# Para el banco JSF 1.2 levantado por levantar.ps1.
$root = Resolve-Path '.work\bench-jsf' -ErrorAction SilentlyContinue
if (-not $root) { Write-Host 'el banco no está desplegado'; exit 0 }
$env:JAVA_HOME = "$root\jdk"
$env:CATALINA_HOME = "$root\tomcat"
$env:CATALINA_BASE = "$root\tomcat"
& "$root\tomcat\bin\shutdown.bat" 2>$null
Start-Sleep -Seconds 3
# red de seguridad: el JVM del banco y solo ese (el de .work), nunca otros javas
Get-CimInstance Win32_Process -Filter "Name='java.exe'" |
  Where-Object { $_.CommandLine -like "*$root*" } |
  ForEach-Object { Write-Host "matando PID $($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force }
Write-Host 'banco parado'
