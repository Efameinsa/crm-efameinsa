# Convierte UNA ficha .doc a .docx. Un proceso de Word por archivo, para que un
# documento que cuelgue la automatización (vínculos por actualizar, diálogos
# viejos) no arrastre a los demás: el que llama pone el timeout y mata Word.
# Uso: convertir-una-ficha.ps1 <origen.doc> <salida.docx>
param([string]$Origen, [string]$Salida)
$ErrorActionPreference = "Stop"

$tmp = Join-Path $env:TEMP "fichas-doc-local"
New-Item -ItemType Directory -Force $tmp | Out-Null
$local = Join-Path $tmp ([IO.Path]::GetFileName($Origen))
Copy-Item $Origen $local -Force

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3            # sin macros
try { $word.Options.UpdateLinksAtOpen = $false } catch {}
try {
  # ReadOnly + contraseña ficticia: un doc protegido falla en vez de preguntar.
  $doc = $word.Documents.Open($local, $false, $true, $false, "sin-password")
  $doc.SaveAs2($Salida, 16)             # 16 = .docx
  $doc.Close($false)
  Write-Output "OK"
} finally {
  $word.Quit()
}
