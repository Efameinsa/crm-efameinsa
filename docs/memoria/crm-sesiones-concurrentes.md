---
name: crm-sesiones-concurrentes
description: "En C:\\Users\\diseno\\Projects\\crm-efameinsa hay varias sesiones de Claude trabajando a la vez sobre la MISMA carpeta; nunca commitear con `git commit -a`"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 31f97cd6-9e71-40ad-89f5-cd2954a73f6d
  modified: 2026-08-29T01:29:07.172Z
---

Darwin corre varias sesiones de Claude Code sobre el mismo working tree de `crm-efameinsa`. El 28-08 pasó lo previsible: mientras yo editaba el filtro de períodos, otra sesión hizo un commit de lo suyo y arrastró mis archivos a medio hacer (`a4dde3e` se llevó la pantalla de Central sin `periodo.ts`, y producción quedó unos minutos con un commit que no compilaba — hubo que arreglarlo con `1e13856`).

**Por qué:** el repo es uno solo y `git add -A` / `git commit -a` no distinguen de quién es cada cambio. HEAD puede moverse entre el inicio y el final de una tarea sin que nadie avise.

**Cómo aplicarlo:**
- Antes de commitear, `git log --oneline -1` y `git status` de nuevo: HEAD puede no ser el que había al empezar, y parte de lo mío puede estar ya commiteado por otra sesión.
- Stagear SIEMPRE la lista explícita de archivos de mi tarea (`git add <archivo> ...`), nunca `-a` ni `-A`.
- Lo que quede modificado y no sea mío (por ejemplo inventario de almacén, catálogo de operaciones) se deja intacto y se le dice al usuario que quedó fuera.
- Verificar el despliegue por HTTP contra el dominio: el conector de Vercel está en la cuenta personal de Darwin (`dsva97`) y el CRM vive en `corporacionefameinsa.sa@gmail.com` — ver [[proyecto-crm-efameinsa]].
