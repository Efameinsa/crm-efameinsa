# Convierte a .docx las fichas .doc que cargar-maestro-completo.mjs necesita.
#
# Por qué Word y no antiword: antiword lee los .doc pero entrega las viñetas
# partidas en renglones de celda de tabla, y reconstruirlas a ojo inventa o
# rompe frases. Word (instalado en esta máquina) las guarda como .docx y de ahí
# el pipeline extrae texto por párrafos y las fotos incrustadas, con el mismo
# código ya probado en el resto del catálogo.
#
# Lee scripts/data/fichas-a-convertir.txt (lo escribe el script de carga) y
# deja los .docx en scripts/data/fichas-convertidas/. No toca los originales.

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$lista = Join-Path $raiz "scripts\data\fichas-a-convertir.txt"
$destino = Join-Path $raiz "scripts\data\fichas-convertidas"

if (-not (Test-Path $lista)) { Write-Output "No hay lista de fichas por convertir ($lista)."; exit 0 }
New-Item -ItemType Directory -Force $destino | Out-Null

$rutas = Get-Content $lista | Where-Object { $_.Trim() }
Write-Output "Fichas por convertir: $($rutas.Count)"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
# La Vista protegida (archivos de una unidad de red) cuelga la automatizacion:
# Word queda esperando un clic en una ventana que nadie ve. Dos defensas: abrir
# sin macros y copiar cada .doc a disco local antes de abrirlo.
$word.AutomationSecurity = 3  # msoAutomationSecurityForceDisable
$tmp = Join-Path $env:TEMP "fichas-doc-local"
New-Item -ItemType Directory -Force $tmp | Out-Null
$ok = 0
try {
  foreach ($ruta in $rutas) {
    $origen = $ruta -replace "/", "\"
    $nombre = [IO.Path]::GetFileNameWithoutExtension($origen) + ".docx"
    $salida = Join-Path $destino $nombre
    if (Test-Path $salida) { Write-Output "  = ya estaba: $nombre"; $ok++; continue }
    try {
      # Copia local: un .doc abierto directo de V: entra en Vista protegida.
      $local = Join-Path $tmp ([IO.Path]::GetFileName($origen))
      Copy-Item $origen $local -Force
      Write-Output "  abriendo: $([IO.Path]::GetFileName($origen))"
      # ReadOnly y con contrasena ficticia: un .doc protegido FALLA en vez de
      # colgar la automatizacion mostrando un dialogo que nadie ve. AddToRecent
      # en falso para no ensuciar los recientes del usuario.
      $doc = $word.Documents.Open($local, $false, $true, $false, "sin-password")
      $doc.SaveAs2($salida, 16)  # 16 = wdFormatDocumentDefault (.docx)
      $doc.Close($false)
      Write-Output "  + $nombre"
      $ok++
    } catch {
      Write-Output "  x $origen -- $($_.Exception.Message)"
    }
  }
} finally {
  $word.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
Write-Output "Convertidas: $ok de $($rutas.Count)"
