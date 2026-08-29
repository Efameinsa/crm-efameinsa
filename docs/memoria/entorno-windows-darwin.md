---
name: entorno-windows-darwin
description: "Entorno de la máquina Windows de Darwin — Node.js portable en AppData, sin gh CLI, git identity local por repo"
metadata: 
  node_type: memory
  type: reference
  originSessionId: af629173-41b8-4628-aeee-be003573e9e6
  modified: 2026-08-20T17:53:58.592Z
---

Máquina Windows 11 de Darwin (usuario `diseno`):

- **Node.js v24.19.0 (LTS)** instalado portable en `C:\Users\diseno\AppData\Local\Programs\nodejs` y agregado al PATH de usuario el 2026-08-11. En Bash de esta sesión puede requerir `export PATH="/c/Users/diseno/AppData/Local/Programs/nodejs:$PATH"` si la shell no recargó el PATH.
- **No hay `gh` CLI** instalado. Git 2.55 sí está.
- No hay `.gitconfig` global; la identidad (Darwin Vilcachagua / darwin.sva.97@gmail.com) se configuró localmente en el repo de [[proyecto-efameinsa]].
- Los proyectos van en `C:\Users\diseno\Projects\`.
- **Microsoft Word 16.0 está disponible por COM** (`New-Object -ComObject Word.Application`): sirve para verificar que un .docx generado abre bien, contar páginas y exportarlo a PDF (formato 17) o a HTML filtrado (formato 10) para mirarlo con Edge. **No hay pandoc.**
- **Para generar .docx** lo que funciona es tomar un .docx existente como plantilla, descomprimirlo (`[System.IO.Compression.ZipFile]::ExtractToDirectory`), **reemplazar solo `word/document.xml`** y volver a comprimir con un escritor de ZIP propio en Node (zlib `deflateRawSync` + cabeceras a mano, con `[Content_Types].xml` de primero). Así se conservan logo, encabezado, pie y estilos. Ojo: los .docx que Word volvió a guardar traen los identificadores de estilo en español (`Ttulo1`, `Prrafodelista`) y el `<w:sectPr>` con atributos, así que conviene detectarlos en `styles.xml` en vez de asumirlos.
- `pdfjs-dist` + `canvas` se instalan bien, pero **fallan al rasterizar PDFs con imágenes** ("Image or Canvas expected"); para mirar un documento conviene el camino Word → HTML filtrado → captura con Edge headless.
