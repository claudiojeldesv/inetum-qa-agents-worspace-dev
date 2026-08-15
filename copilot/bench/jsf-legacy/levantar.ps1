# Levanta el banco JSF 1.2 (era Java 5) SIN Docker: JDK 8 + Tomcat 7 en espacio de
# usuario. Es el camino verificado — en la máquina donde se construyó este banco,
# Docker Desktop estaba en bucle de arranque fallido y este no depende de él.
#
# No instala nada: descarga tres zips a .work/bench-jsf (ignorado por git), los
# descomprime y arranca Tomcat con JAVA_HOME apuntando SOLO para ese proceso. Ni
# PATH, ni registro, ni administrador. Se desmonta con: Remove-Item .work\bench-jsf -Recurse
#
#   powershell -File copilot/bench/jsf-legacy/levantar.ps1
#   → http://localhost:8080/jsf/home.jsf
#
# Para pararlo: copilot/bench/jsf-legacy/parar.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$d = '.work\bench-jsf'
New-Item -ItemType Directory -Force -Path $d | Out-Null

$descargas = @(
  @{ u = 'https://archive.apache.org/dist/tomcat/tomcat-7/v7.0.109/bin/apache-tomcat-7.0.109.zip'; f = "$d\tomcat7.zip" },
  @{ u = 'https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse';  f = "$d\jdk8.zip" },
  # los ejemplos OFICIALES de Apache MyFaces/Tomahawk, sin tocar: el DOM lo produce
  # el renderer de JSF, no nosotros. Un fixture escrito a mano daría verdes que mienten.
  @{ u = 'https://repo1.maven.org/maven2/org/apache/myfaces/tomahawk/myfaces-example-simple/1.1.14/myfaces-example-simple-1.1.14.war'; f = "$d\jsf.war" }
)
foreach ($j in $descargas) {
  if (Test-Path $j.f) { Write-Host "ya estaba: $($j.f)"; continue }
  Write-Host "descargando $($j.u)"
  Invoke-WebRequest -Uri $j.u -OutFile $j.f -UseBasicParsing -TimeoutSec 600
}

if (-not (Test-Path "$d\tomcat")) {
  Expand-Archive "$d\tomcat7.zip" -DestinationPath "$d\tmp-tc" -Force
  Move-Item (Get-ChildItem "$d\tmp-tc" -Directory | Select-Object -First 1).FullName "$d\tomcat"
  Remove-Item "$d\tmp-tc" -Recurse -Force
}
if (-not (Test-Path "$d\jdk")) {
  Expand-Archive "$d\jdk8.zip" -DestinationPath "$d\tmp-jdk" -Force
  Move-Item (Get-ChildItem "$d\tmp-jdk" -Directory | Select-Object -First 1).FullName "$d\jdk"
  Remove-Item "$d\tmp-jdk" -Recurse -Force
}
Get-ChildItem "$d\tomcat\webapps" -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item "$d\jsf.war" "$d\tomcat\webapps\jsf.war" -Force

# Estado de la vista en SERVIDOR (K0.35): los ejemplos vienen con `client`, que se
# lleva el árbol dentro del HTML y hace que la vista no caduque nunca. En banca es
# al revés, y por eso allí la vista caducada es cotidiana. Se declara en la
# configuración del contenedor para no tocar el WAR oficial.
$ctx = "$d\tomcat\conf\Catalina\localhost"
New-Item -ItemType Directory -Force -Path $ctx | Out-Null
Copy-Item 'copilot\bench\jsf-legacy\context-estado-servidor.xml' "$ctx\jsf.xml" -Force

$root = (Resolve-Path $d).Path
$env:JAVA_HOME = "$root\jdk"
$env:CATALINA_HOME = "$root\tomcat"
$env:CATALINA_BASE = "$root\tomcat"
Start-Process -FilePath "$root\tomcat\bin\catalina.bat" -ArgumentList 'run' -WorkingDirectory "$root\tomcat\bin" -WindowStyle Hidden

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 3
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:8080/jsf/' -UseBasicParsing -TimeoutSec 20
    Write-Host "banco arriba: HTTP $($r.StatusCode) → http://localhost:8080/jsf/home.jsf"
    exit 0
  } catch { }
}
Write-Error 'Tomcat no respondio en 90 s; revisa .work\bench-jsf\tomcat\logs\catalina.*.log'
