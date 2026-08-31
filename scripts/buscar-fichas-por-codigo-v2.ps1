# ============================================================
# CRM EFAMEINSA - Reporte "Fichas tecnicas por codigo v2" (el Excel)
# ============================================================
# Dibuja "V:\Fichas tecnicas por codigo v2.xlsx" con el JSON que deja
# scripts/buscar-fichas-por-codigo-v2.mjs.
#
# Se usa Excel (COM) y no la libreria xlsx de node por dos razones: el
# documento lo leen Lesly y gerencia (cabecera granate de marca, semaforo,
# panel congelado, autofiltro), y sobre todo porque hace falta HIPERVINCULO
# real a cada Word o PDF - que es justo lo que pidio Darwin: poder abrir el
# archivo desde el reporte.
#
# Dos hojas nuevas respecto de la v1:
#   REVISAR CON LESLY  - lo que los cuatro Excels se contradicen entre si.
#   CAMBIOS VS V1      - lo que se movio desde el reporte del 27-08 09:51.
#
# Uso (despues del .mjs):
#   powershell -ExecutionPolicy Bypass -File scripts/buscar-fichas-por-codigo-v2.ps1

# -Salida deja escribir el libro en otro sitio cuando el de la V: esta abierto
# en Excel y no se puede sobrescribir.
param([string]$Salida)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$json = Join-Path $raiz "scripts\data\fichas-por-codigo-v2.json"
$salida = if ($Salida) { $Salida } else { "V:\Fichas tecnicas por codigo v2.xlsx" }

if (-not (Test-Path $json)) { throw "Falta $json. Corre primero: node scripts/buscar-fichas-por-codigo-v2.mjs" }
$d = Get-Content -Raw -Path $json -Encoding UTF8 | ConvertFrom-Json

$GRANATE = 0x12127E   # COM usa BGR: esto es #7E1210, el granate del manual de marca
$VERDE_F = 0xC6EFCE; $VERDE_L = 0x006100
$AMBAR_F = 0xFFEB9C; $AMBAR_L = 0x9C6500
$ROJO_F  = 0xCEC7FF; $ROJO_L  = 0x2016B0

if (Test-Path $salida) {
  $copia = Join-Path (Split-Path -Parent $salida) (([IO.Path]::GetFileNameWithoutExtension($salida)) + (" - backup {0}.xlsx" -f (Get-Date -Format "yyyy-MM-dd HHmm")))
  Copy-Item $salida $copia -Force
  Write-Output "Copia previa: $copia"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

$HOJAS = 7
$wb = $excel.Workbooks.Add()
while ($wb.Worksheets.Count -lt $HOJAS) { $wb.Worksheets.Add() | Out-Null }
while ($wb.Worksheets.Count -gt $HOJAS) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }

function Escribir-Hoja {
  param($ws, [string]$titulo, [string[]]$cabeceras, $filas, [scriptblock]$mapa, [int[]]$anchos)
  $ws.Name = $titulo
  for ($c = 0; $c -lt $cabeceras.Count; $c++) { $ws.Cells.Item(1, $c + 1) = $cabeceras[$c] }
  $cab = $ws.Range($ws.Cells.Item(1, 1), $ws.Cells.Item(1, $cabeceras.Count))
  $cab.Font.Bold = $true
  $cab.Interior.Color = $GRANATE
  $cab.Font.Color = 0xFFFFFF
  $ws.Rows.Item(1).RowHeight = 22
  $n = @($filas).Count
  if ($n -gt 0) {
    $arr = New-Object 'object[,]' $n, $cabeceras.Count
    for ($i = 0; $i -lt $n; $i++) {
      $valores = & $mapa @($filas)[$i]
      for ($c = 0; $c -lt $cabeceras.Count; $c++) { $arr[$i, $c] = $valores[$c] }
    }
    $ws.Range($ws.Cells.Item(2, 1), $ws.Cells.Item(1 + $n, $cabeceras.Count)).Value2 = $arr
  }
  for ($c = 0; $c -lt $anchos.Count; $c++) { $ws.Columns.Item($c + 1).ColumnWidth = $anchos[$c] }
  $ws.Range("A1").AutoFilter() | Out-Null
  return $n
}

# El enlace se pone sobre el NOMBRE del archivo y no sobre la ruta larga, para
# que la celda se lea. La ruta completa queda igual en su propia columna, que
# es lo que se copia y pega cuando hay que mandarla por correo.
#
# Se usa la formula HYPERLINK y no Hyperlinks.Add a proposito: como el libro
# vive en V:\, Excel guarda los Hyperlinks.Add como ruta RELATIVA
# ("LESLY/GMP ok/...") y el enlace se rompe en cuanto alguien copia el reporte
# a su escritorio o lo manda por correo. La formula guarda la ruta absoluta
# tal cual se escribe.
function Enlazar {
  param($ws, [int]$colTexto, [int]$colRuta, [int]$n)
  for ($r = 2; $r -le (1 + $n); $r++) {
    $ruta = "$($ws.Cells.Item($r, $colRuta).Text)"
    if ($ruta -notlike "V:*") { continue }
    $texto = "$($ws.Cells.Item($r, $colTexto).Text)"
    $celda = $ws.Cells.Item($r, $colTexto)
    $celda.Formula = '=HYPERLINK("' + $ruta.Replace('"', '""') + '","' + $texto.Replace('"', '""') + '")'
    $celda.Font.Color = 0xC06000
    $celda.Font.Underline = $true
  }
}

# ================= Hoja 1: RESUMEN =================
$wsR = $wb.Worksheets.Item(1)
$wsR.Name = "RESUMEN"
$wsR.Cells.Item(1, 1) = "Fichas tecnicas por codigo - VERSION 2"
$wsR.Cells.Item(1, 1).Font.Bold = $true
$wsR.Cells.Item(1, 1).Font.Size = 16
$wsR.Cells.Item(1, 1).Font.Color = $GRANATE

$lineas = New-Object System.Collections.Generic.List[object]
$lineas.Add(@("Generado el", $d.generado))
$lineas.Add(@("", ""))
$lineas.Add(@("QUE PREGUNTA RESPONDE", ""))
$lineas.Add(@("De cada producto codificado por Lesly, donde esta su ficha tecnica (Word o PDF).", ""))
$lineas.Add(@("", ""))
$lineas.Add(@("POR QUE HAY UNA VERSION 2", ""))
$lineas.Add(@("La v1 se genero el 27-08 a las 09:51 y los cuatro Excels se tocaron despues de esa hora.", ""))
$lineas.Add(@("Ademas el libro de modificaciones estreno la hoja COCHE, con 13 codigos que la v1 no miro.", ""))
$lineas.Add(@("Y el archivo de la v1 se edito a mano en Excel el 27-08 a las 16:50: ya no es salida de un script.", ""))
$lineas.Add(@("Esta v2 vuelve a leer todo desde cero, con la misma regla del codigo exacto.", ""))
$lineas.Add(@("", ""))
$lineas.Add(@("DE DONDE SALEN LOS CODIGOS (los 4 Excels)", ""))
foreach ($l in $d.libros) { $lineas.Add(@("  " + $l.corto, $l.archivo)) }
$lineas.Add(@("  Hojas leidas", ($d.hojasLeidas -join "  |  ")))
$lineas.Add(@("", ""))
$lineas.Add(@("DONDE SE BUSCO: SOLO ESTAS DOS CARPETAS", ""))
foreach ($r in $d.raices) { $lineas.Add(@("  " + $r, "carpeta completa, con todas sus subcarpetas")) }
$lineas.Add(@("  Se miraron", "$($d.totales.archivosRevisados) archivos: $($d.totales.words) Word (.doc/.docx) y $($d.totales.pdfs) PDF"))
$lineas.Add(@("No se miro nada mas de V:\ - ni las carpetas de catalogo (01. LAVADORAS, 02. SECADORAS...),", ""))
$lineas.Add(@("ni 15. LICITACIONES, ni NO TOCAR. Ahi hay Word y PDF, pero no son las fichas de Lesly.", ""))
$lineas.Add(@("", ""))
$lineas.Add(@("QUE EXCEL MANDA CUANDO SE CONTRADICEN", ""))
$lineas.Add(@("Se leen en orden, del mas viejo al mas nuevo, y el ultimo pisa al anterior.", ""))
$lineas.Add(@("Una celda vacia NO borra: solo pisa lo que el libro nuevo dice de verdad.", ""))
$lineas.Add(@("La columna DATO VIGENTE SEGUN de cada hoja dice de que libro y hoja sale esa fila.", ""))
foreach ($v in $d.vigentePorLibro) { $lineas.Add(@("  " + $v.libro, "$($v.filas) filas vigentes")) }
$lineas.Add(@("", ""))
$lineas.Add(@("COMO SE BUSCO: SOLO POR EL CODIGO", ""))
$lineas.Add(@("No se busco por nombre, ni por modelo, ni por marca: solo por el codigo del Excel.", ""))
$lineas.Add(@("El codigo tiene que aparecer COMPLETO. Por eso CALE25 no cuenta como CALE251,", ""))
$lineas.Add(@("CO402 no cuenta como CO402A y SECU75 no cuenta como SECU755: son maquinas distintas.", ""))
$lineas.Add(@("Si al codigo le sigue una palabra larga (LAVUY2802LAVADORA...) si cuenta: solo falta el guion.", ""))
$lineas.Add(@("Orden de busqueda: 1) nombre del archivo  2) nombre de la carpeta  3) texto dentro del Word.", ""))
$lineas.Add(@("Es la misma regla de la v1, sin tocar una letra.", ""))
$lineas.Add(@("", ""))
$lineas.Add(@("RESULTADO", ""))
$lineas.Add(@("Codigos de producto en los 4 Excels", $d.totales.codigos))
$lineas.Add(@("  CON ficha encontrada", $d.totales.encontrados))
$lineas.Add(@("     por el nombre del archivo", $d.totales.porNombre))
$lineas.Add(@("     por el nombre de la carpeta", $d.totales.porCarpeta))
$lineas.Add(@("     por el texto dentro del Word", $d.totales.porTexto))
$lineas.Add(@("  SIN ficha (no aparece por ningun lado)", $d.totales.noEncontrados))
$lineas.Add(@("Archivos de esas carpetas que no le tocan a ningun codigo", $d.totales.archivosSinCodigo))
$lineas.Add(@("", ""))
$lineas.Add(@("LISTOS PARA SUBIR AL SISTEMA", ""))
$lineas.Add(@("Archivos con ruta, uno por codigo, en la hoja ENCONTRADOS", $d.totales.encontrados))
$lineas.Add(@("La columna RUTA COMPLETA es la que se copia. ABRIR LA FICHA abre el Word con un clic.", ""))
$lineas.Add(@("", ""))
$lineas.Add(@("LO QUE HAY QUE REVISAR CON LESLY", ""))
$lineas.Add(@("  Codigo repetido dentro de la misma hoja, para dos equipos distintos", $d.totales.codigoRepetido))
$lineas.Add(@("  El mismo equipo con dos codigos distintos segun el Excel", $d.totales.equipoConVariosCodigos))
$lineas.Add(@("  Codigos donde los Excels no dicen lo mismo (descripcion o precio)", $d.totales.noDicenLoMismo))
$lineas.Add(@("", ""))
if ($d.cambios) {
  $lineas.Add(@("QUE CAMBIO DESDE LA V1", ""))
  $lineas.Add(@("  La v1 se genero el", $d.cambios.generadoV1))
  $lineas.Add(@("  Codigos entonces / ahora", "$($d.cambios.codigosV1)  ->  $($d.totales.codigos)"))
  $lineas.Add(@("  Con ficha entonces / ahora", "$($d.cambios.encontradosV1)  ->  $($d.totales.encontrados)"))
  $lineas.Add(@("  Lineas de cambio (hoja CAMBIOS VS V1)", $d.totales.cambios))
  $lineas.Add(@("", ""))
}
$lineas.Add(@("LAS HOJAS QUE NO SE PUDIERON BUSCAR", ""))
$lineas.Add(@("Estas hojas de los Excels NO tienen columna de codigo, solo modelo y descripcion.", ""))
$lineas.Add(@("Bajo la condicion de buscar solo por codigo, quedan fuera de este reporte.", ""))
foreach ($h in $d.hojasSinCodigo) { $lineas.Add(@("  " + $h.libro + "  /  " + $h.hoja, "$($h.filas) equipos")) }
$lineas.Add(@("", ""))
$lineas.Add(@("COMO SE REHACE ESTE REPORTE", ""))
$lineas.Add(@("1.", "node scripts/buscar-fichas-por-codigo-v2.mjs"))
$lineas.Add(@("2.", "powershell -ExecutionPolicy Bypass -File scripts/buscar-fichas-por-codigo-v2.ps1"))

$r = 3
foreach ($l in $lineas) {
  $wsR.Cells.Item($r, 1) = $l[0]
  if ("$($l[1])" -match '^\d{4}-\d{2}-\d{2} ') { $wsR.Cells.Item($r, 2).NumberFormat = "@" }
  if ("$($l[1])" -ne "") { $wsR.Cells.Item($r, 2) = $l[1] }
  if ($l[0] -match '^[A-Z][A-Z0-9 ,:\(\)]+$' -and "$($l[1])" -eq "") {
    $wsR.Cells.Item($r, 1).Font.Bold = $true
    $wsR.Cells.Item($r, 1).Font.Color = $GRANATE
  }
  $r++
}
$wsR.Columns.Item(1).ColumnWidth = 82
$wsR.Columns.Item(2).ColumnWidth = 90

# El aviso que resume el propio codigo del producto: si el mismo codigo nombra
# a dos equipos, o si el equipo tiene otro codigo en otro Excel, la fila del
# reporte se lee mal sin saberlo. Va en su propia columna en las dos hojas de
# resultado.
function Aviso {
  param($f)
  $a = @()
  if ($f.codigoRepetido) { $a += "CODIGO REPETIDO: nombra a mas de un equipo" }
  if (@($f.otrosCodigosDelMismoEquipo).Count -gt 0) { $a += "MISMO EQUIPO TAMBIEN COMO: " + (@($f.otrosCodigosDelMismoEquipo) -join ", ") }
  return ($a -join "  |  ")
}

# ================= Hoja 2: ENCONTRADOS =================
$hallados = @($d.filas | Where-Object { $_.encontrado })
$ws2 = $wb.Worksheets.Item(2)
$n2 = Escribir-Hoja $ws2 "ENCONTRADOS" `
  @("CODIGO", "EQUIPO", "MARCA", "STOCK", "UBICACION", "PRECIO", "EN QUE EXCELS", "DATO VIGENTE SEGUN", "SE ENCONTRO POR", "ARCHIVOS", "TIPO", "ABRIR LA FICHA", "RUTA COMPLETA", "OTROS ARCHIVOS DEL MISMO CODIGO", "OJO") `
  $hallados `
  { param($f) @(
      $f.codigo, $f.equipo, $f.marca, $f.stock, $f.ubicacion,
      $(if ($f.precio) { [double]$f.precio } else { $null }),
      ($f.libros -join " + "), ($f.manda + " / " + $f.mandaHoja), $f.donde, $f.cuantos,
      (($f.archivos | ForEach-Object { $_.tipo } | Sort-Object -Unique) -join "/"),
      $f.archivos[0].nombre, $f.archivos[0].ruta,
      (($f.archivos | Select-Object -Skip 1 | ForEach-Object { $_.ruta }) -join "  |  "),
      (Aviso $f)) } `
  @(14, 62, 14, 8, 12, 12, 26, 34, 22, 10, 10, 62, 86, 86, 52)

Enlazar $ws2 12 13 $n2
if ($n2 -gt 0) { $ws2.Range($ws2.Cells.Item(2, 6), $ws2.Cells.Item(1 + $n2, 6)).NumberFormat = "#,##0.00" }
for ($rr = 2; $rr -le (1 + $n2); $rr++) {
  $c = $ws2.Cells.Item($rr, 9)
  if ("$($c.Text)" -eq "Nombre del archivo") { $c.Interior.Color = $VERDE_F; $c.Font.Color = $VERDE_L }
  else { $c.Interior.Color = $AMBAR_F; $c.Font.Color = $AMBAR_L }
  # La fila que manda el libro de modificaciones: es el dato nuevo del 26-08,
  # el que pisa a los tres maestros.
  $m = $ws2.Cells.Item($rr, 8)
  if ("$($m.Text)" -like "MODIF*") { $m.Interior.Color = $VERDE_F; $m.Font.Color = $VERDE_L; $m.Font.Bold = $true }
  $o = $ws2.Cells.Item($rr, 15)
  if ("$($o.Text)" -ne "") { $o.Interior.Color = $AMBAR_F; $o.Font.Color = $AMBAR_L }
}
$ws2.Activate()
$excel.ActiveWindow.SplitRow = 1
$excel.ActiveWindow.FreezePanes = $true

# ================= Hoja 3: NO ENCONTRADOS =================
$faltan = @($d.filas | Where-Object { -not $_.encontrado })
$ws3 = $wb.Worksheets.Item(3)
$n3 = Escribir-Hoja $ws3 "NO ENCONTRADOS" `
  @("CODIGO", "EQUIPO", "MARCA", "STOCK", "UBICACION", "PRECIO", "EN QUE EXCELS", "DATO VIGENTE SEGUN", "QUE PASA", "PISTA: DONDE PUEDE ESTAR LA FICHA", "OJO") `
  $faltan `
  { param($f) @(
      $f.codigo, $f.equipo, $f.marca, $f.stock, $f.ubicacion,
      $(if ($f.precio) { [double]$f.precio } else { $null }),
      ($f.libros -join " + "), ($f.manda + " / " + $f.mandaHoja),
      $(if (@($f.pistas).Count -gt 0) { "El archivo existe pero con OTRO codigo" } else { "No hay ningun archivo con ese codigo" }),
      (($f.pistas) -join "  |  "),
      (Aviso $f)) } `
  @(14, 62, 14, 8, 12, 12, 26, 34, 40, 110, 52)

if ($n3 -gt 0) { $ws3.Range($ws3.Cells.Item(2, 6), $ws3.Cells.Item(1 + $n3, 6)).NumberFormat = "#,##0.00" }
for ($rr = 2; $rr -le (1 + $n3); $rr++) {
  $c = $ws3.Cells.Item($rr, 9)
  if ("$($c.Text)" -like "El archivo existe*") { $c.Interior.Color = $AMBAR_F; $c.Font.Color = $AMBAR_L }
  else { $c.Interior.Color = $ROJO_F; $c.Font.Color = $ROJO_L }
  $m = $ws3.Cells.Item($rr, 8)
  if ("$($m.Text)" -like "MODIF*") { $m.Interior.Color = $VERDE_F; $m.Font.Color = $VERDE_L; $m.Font.Bold = $true }
  $o = $ws3.Cells.Item($rr, 11)
  if ("$($o.Text)" -ne "") { $o.Interior.Color = $AMBAR_F; $o.Font.Color = $AMBAR_L }
}


# ================= Hoja 4: TODOS LOS ARCHIVOS =================
# Una fila por archivo encontrado, cada una con su propio enlace: es la vista
# util cuando un codigo tiene varias fichas (colores, voltajes).
$ws4 = $wb.Worksheets.Item(4)
$ws4.Columns.Item(6).NumberFormat = "@"
$n4 = Escribir-Hoja $ws4 "TODOS LOS ARCHIVOS" `
  @("CODIGO", "EQUIPO", "MARCA", "ABRIR LA FICHA", "TIPO", "MODIFICADO", "KB", "CARPETA RAIZ", "RUTA COMPLETA") `
  $d.detalle `
  { param($x) @($x.codigo, $x.equipo, $x.marca, $x.nombre, $x.tipo, $x.modificado, $x.kb, $x.raiz, $x.ruta) } `
  @(14, 56, 14, 66, 8, 18, 8, 34, 90)
Enlazar $ws4 4 9 $n4

# ================= Hoja 5: ARCHIVOS SIN CODIGO =================
$ws5 = $wb.Worksheets.Item(5)
$ws5.Columns.Item(4).NumberFormat = "@"
$n5 = Escribir-Hoja $ws5 "ARCHIVOS SIN CODIGO" `
  @("ABRIR EL ARCHIVO", "TIPO", "CARPETA", "MODIFICADO", "KB", "CARPETA RAIZ", "RUTA COMPLETA") `
  $d.archivosSinCodigo `
  { param($a) @($a.nombre, $a.tipo, $a.carpeta, $a.modificado, $a.kb, $a.raiz, $a.ruta) } `
  @(74, 8, 30, 18, 8, 34, 90)
Enlazar $ws5 1 7 $n5

# ================= Hoja 6: REVISAR CON LESLY =================
# Lo que los cuatro Excels se contradicen entre si. No se corrige nada aqui:
# el codigo lo pone Lesly. Es la lista de decisiones pendientes.
#
# Es un array y no un List[object] a proposito: en este PowerShell, @($lista)
# sobre un List[object] de PSCustomObject revienta con "los tipos de argumentos
# no coinciden", y Escribir-Hoja cuenta las filas justo asi.
$revisar = @()
foreach ($x in $d.codigoRepetido) {
  $revisar += ([pscustomobject]@{
    tipo = "CODIGO REPETIDO"; codigo = $x.codigo
    quePasa = "El mismo codigo nombra a mas de un equipo dentro de la misma hoja. El reporte se queda con el ultimo y el otro equipo no sale."
    detalle = ($x.donde -join "  |  ")
  })
}
foreach ($x in $d.equipoConVariosCodigos) {
  $revisar += ([pscustomobject]@{
    tipo = "UN EQUIPO, VARIOS CODIGOS"; codigo = (@($x.codigos) -join " / ")
    quePasa = "El mismo equipo esta codificado distinto segun el Excel. Uno de los dos sale sin ficha por eso."
    detalle = ($x.donde -join "  |  ") + "   ::   " + $x.equipo
  })
}
foreach ($x in $d.noDicenLoMismo) {
  $revisar += ([pscustomobject]@{
    tipo = "LOS EXCELS NO DICEN LO MISMO"; codigo = $x.codigo
    quePasa = "Cambia: $($x.queCambia). El reporte toma lo que dice $($x.manda)."
    detalle = ($x.donde -join "  |  ")
  })
}
$ws6 = $wb.Worksheets.Item(6)
$n6 = Escribir-Hoja $ws6 "REVISAR CON LESLY" `
  @("TIPO", "CODIGO", "QUE PASA", "DETALLE") `
  $revisar `
  { param($x) @($x.tipo, $x.codigo, $x.quePasa, $x.detalle) } `
  @(30, 24, 92, 150)
for ($rr = 2; $rr -le (1 + $n6); $rr++) {
  $c = $ws6.Cells.Item($rr, 1)
  if ("$($c.Text)" -eq "CODIGO REPETIDO") { $c.Interior.Color = $ROJO_F; $c.Font.Color = $ROJO_L }
  else { $c.Interior.Color = $AMBAR_F; $c.Font.Color = $AMBAR_L }
}

# ================= Hoja 7: CAMBIOS VS V1 =================
# Se compara contra el JSON del script de la v1, no contra el Excel que esta
# en V:\ - ese fue editado a mano el 27-08 a las 16:50.
$ws7 = $wb.Worksheets.Item(7)
$lineasCambio = @()
if ($d.cambios) { $lineasCambio = @($d.cambios.lineas) }
$n7 = Escribir-Hoja $ws7 "CAMBIOS VS V1" `
  @("QUE CAMBIO", "CODIGO", "EQUIPO", "EN QUE EXCELS", "DETALLE") `
  $lineasCambio `
  { param($x) @($x.tipo, $x.codigo, $x.equipo, $x.libros, $x.detalle) } `
  @(24, 14, 62, 30, 96)
for ($rr = 2; $rr -le (1 + $n7); $rr++) {
  $c = $ws7.Cells.Item($rr, 1)
  $t = "$($c.Text)"
  if ($t -eq "GANO FICHA" -or $t -eq "CODIGO NUEVO") { $c.Interior.Color = $VERDE_F; $c.Font.Color = $VERDE_L }
  elseif ($t -eq "PERDIO FICHA" -or $t -eq "CODIGO QUE YA NO ESTA") { $c.Interior.Color = $ROJO_F; $c.Font.Color = $ROJO_L }
  else { $c.Interior.Color = $AMBAR_F; $c.Font.Color = $AMBAR_L }
}

$wb.Worksheets.Item(1).Activate()
$excel.ScreenUpdating = $true
$wb.SaveAs($salida, 51)
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect(); [GC]::WaitForPendingFinalizers()

Write-Output "Guardado: $salida"
Write-Output "  ENCONTRADOS .......... $n2"
Write-Output "  NO ENCONTRADOS ....... $n3"
Write-Output "  TODOS LOS ARCHIVOS ... $n4"
Write-Output "  ARCHIVOS SIN CODIGO .. $n5"
Write-Output "  REVISAR CON LESLY .... $n6"
Write-Output "  CAMBIOS VS V1 ........ $n7"
