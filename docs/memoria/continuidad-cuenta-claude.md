---
name: continuidad-cuenta-claude
description: "Cómo retomar el CRM Efameinsa desde una cuenta de Claude nueva — todo lo importante vive en el repo, no en la conversación"
metadata: 
  node_type: memory
  type: project
  originSessionId: 14334818-76e3-47a1-a6b6-8d93f2ef1bfe
  modified: 2026-08-29T02:29:39.902Z
---

Darwin cambia de cuenta de Claude el **29-08-2026 por la noche**. Todo lo necesario para seguir quedó **dentro del repositorio**, que es lo único que no depende de la cuenta ni del historial de chats:

- **`CLAUDE.md`** — Claude Code lo lee solo al abrir el proyecto. Arriba del todo apunta al documento de continuidad.
- **`docs/19-estado-y-continuidad.md`** — el traspaso completo: estado real del sistema, quién es quién, reglas que no se rediscuten, pendientes, cómo se trabaja y las trampas conocidas (RLS por fila, el filtro sobre una columna inexistente que vacía la consulta entera, `sm:max-w-*`, la ficha que imprime desde `bloques`, un precio por producto/tier/día, varios productos con el mismo modelo).
- **Las cabeceras de las migraciones** — cada una explica POR QUÉ se hizo, citando a quien lo pidió.

**Para retomar:** abrir Claude Code en `C:\Users\diseno\Projects\crm-efameinsa` (no en `.local\bin`) y pedirle que lea `docs/19-estado-y-continuidad.md`.

⚠️ **Esta carpeta de memoria es de la máquina, no de la cuenta** — sobrevive al cambio de cuenta, pero está atada a la ruta desde donde se abre Claude Code (`C--Users-diseno--local-bin`). Si se abre desde el repo, la memoria será otra: por eso lo importante está en el repo y no acá.

Relacionado: [[proyecto-crm-efameinsa]], [[entorno-windows-darwin]].
