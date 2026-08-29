---
name: identidad-marca-efameinsa
description: "Identidad visual EFAMEINSA — paleta granate/carbón/gris, tipografía LG Smart (instalada), logo y reglas, para todo documento de gerencia"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7b2106aa-cf1b-4e03-8d8c-cf8075afc513
  modified: 2026-08-13T21:19:16.762Z
---

Extraída de `C:\Users\diseno\Downloads\manual_de_marca_efameinsa.pdf` (24 págs). Aplicar en todo documento para gerencia (ver [[autoria-y-marca-documentos]]).

**Paleta (valores impresos en el manual):** Granate Efameinsa `#7E1210` (primario), Negro `#000000`, Gris `#6B6B6B`, Blanco. En el arte real del logo el "negro" renderiza como carbón azulado `#2C2E35` — usarlo como negro de marca en digital para que combine con el logo.

**Tipografía:** el manual define LG Smart como corporativa (instalada en C:\Windows\Fonts), **pero el usuario decidió (2026-08-13) usar Arial en los documentos por legibilidad** — usar `Arial, "Segoe UI", sans-serif` en todo documento de gerencia; LG Smart solo si la piden explícitamente.

**Logo:** isotipo (círculo carbón con "e" de arcos concéntricos + arco granate) + wordmark EFAMEINSA slab serif granate. Área de protección 2X perimetral; mínimo digital 100 px de ancho (recomendado 300 px). Variantes: positivo, B/N, negativo blanco sobre granate o carbón. PNG recortado en alta resolución (2345×381, fondo blanco): `C:\Users\diseno\Downloads\PROYECTO CRM EFAMEINSA\logo-efameinsa.png`.

**Voz:** trato de usted, tono corporativo simple y preciso; en texto corrido la marca se escribe "Efameinsa" (solo inicial mayúscula — EFAMEINSA queda reservado al logo); "y" en vez de "&"; capitalización tipo oración.

**Estilo de maquetación del manual:** fondo blanco con aire, titulares en VERSALES granate alineados a la izquierda, subtítulos SemiBold carbón, cuerpo gris oscuro, franja/pestaña granate con folio como única decoración.

**Flujo de generación de PDF que funciona en esta máquina (sin Python/poppler):** HTML con CSS print (@page A4) → `msedge.exe --headless --print-to-pdf` → verificación renderizando páginas con Node + pdfjs-dist + canvas (paquetes en el scratchpad de cada sesión: `npm i pdfjs-dist canvas`).
