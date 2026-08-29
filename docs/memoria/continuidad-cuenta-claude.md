---
name: continuidad-cuenta-claude
description: "Cómo retomar el CRM Efameinsa en una máquina o cuenta nuevas — todo lo importante vive en el repo, y la memoria se instala desde docs/memoria"
metadata: 
  node_type: memory
  type: project
  originSessionId: f45e7f8f-fea2-4caf-a65f-21983e184bfe
  modified: 2026-08-29T17:18:23.268Z
---

Darwin cambia de **cuenta de Claude y de máquina el 29-08-2026**. Todo lo
necesario para seguir quedó **dentro del repositorio**, que es lo único que no
depende de la cuenta, del historial de chats ni del disco:

- **`CLAUDE.md`** — Claude Code lo lee solo al abrir el proyecto. Arriba del
  todo apunta al documento de continuidad.
- **`docs/19-estado-y-continuidad.md`** — el traspaso completo: estado real del
  sistema, quién es quién, reglas que no se rediscuten, pendientes, cómo se
  trabaja y las **trampas conocidas** (RLS por fila, el filtro sobre una columna
  inexistente que vacía la consulta entera, `sm:max-w-*`, `if not funcion()` con
  `null`, `truncate` estirando la página, la ficha que imprime desde `bloques`,
  un precio por producto/tier/día, varios productos con el mismo modelo).
- **`docs/21`** — el archivo histórico del servidor, que es el proyecto grande
  que quedó planteado y sin construir.
- **Las cabeceras de las migraciones** — cada una explica POR QUÉ se hizo,
  citando a quien lo pidió.

**En la máquina nueva, en este orden:**

1. `git clone https://github.com/Efameinsa/crm-efameinsa` (Vercel: la cuenta es
   **corporacionefameinsa.sa@gmail.com**, no la personal de Darwin).
2. `node scripts/instalar-memoria.mjs` — copia `docs/memoria/` a donde Claude
   Code la lee sola. **Sin esto la memoria no viaja: vive en el disco.**
3. Copiar `.env.local` (no se versiona: trae `DATABASE_URL` y las claves de
   Supabase y R2). Pedírselo a Darwin, que lo lleva aparte.
4. Abrir Claude Code y pedirle que lea `docs/19-estado-y-continuidad.md`.

⚠️ **La carpeta de memoria depende de DÓNDE se abre Claude Code**, no del
repositorio: es `~/.claude/projects/<ruta-con-guiones>/memory/`. Hasta el 29-08
las sesiones se abrían desde `C:\Users\diseno\.local\bin`, así que la memoria
viva es `C--Users-diseno--local-bin` y **no** la del repo. Por eso
`instalar-memoria.mjs` acepta `--proyecto <ruta>`: para recoger desde la carpeta
que de verdad se usó (`node scripts/instalar-memoria.mjs --recoger --proyecto "C:\Users\diseno\.local\bin"`).
**Antes de dejar una máquina, recoger y commitear.**

Relacionado: [[proyecto-crm-efameinsa]], [[entorno-windows-darwin]].
