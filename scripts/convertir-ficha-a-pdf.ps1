# Exporta UNA ficha .docx a PDF, para poder MIRARLA como la ve Lesly.
#
# Es el paso que pidió Darwin el 27-08: «siempre haz una vista para analizar lo
# que tienes y ver de dónde a dónde es la imagen y de dónde a dónde es otro
# elemento». Los archivos incrustados en el .docx no lo dicen —su nombre es
# image3.png y su orden no siempre es el de la página—, y en cambio la hoja
# armada lo muestra sin lugar a dudas.
#
# Un proceso de Word por archivo y con timeout, como en convertir-una-ficha.ps1:
# un documento que cuelgue no se lleva puestos a los demás.
#
# Uso: convertir-ficha-a-pdf.ps1 <origen.docx> <salida.pdf>
param([string]$Origen, [string]$Salida)
$ErrorActionPreference = "Stop"

$tmp = Join-Path $env:TEMP "fichas-vista"
New-Item -ItemType Directory -Force $tmp | Out-Null
$local = Join-Path $tmp ([IO.Path]::GetFileName($Origen))
Copy-Item $Origen $local -Force

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3            # sin macros
try { $word.Options.UpdateLinksAtOpen = $false } catch {}
try {
  $doc = $word.Documents.Open($local, $false, $true, $false, "sin-password")
  $doc.SaveAs2($Salida, 17)             # 17 = PDF
  $doc.Close($false)
  Write-Output "OK"
} finally {
  $word.Quit()
}
