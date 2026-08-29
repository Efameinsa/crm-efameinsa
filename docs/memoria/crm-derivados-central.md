---
name: crm-derivados-central
description: "Rediseño 27-08 de /central/derivados (lista legible + ficha con historial de gestión); listo en local, falta desplegar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 939ee488-39fa-40cc-9746-45bf3415a0f2
  modified: 2026-08-27T13:29:30.062Z
---

Central pidió con urgencia el 27-08-2026 arreglar `/central/derivados`: la tabla de 10
columnas con letra de 11 px era ilegible y no respondía su pregunta real («¿alguien llamó
al cliente?»). Rediseñado en local: lista de una fila por caso con cajones sin atender /
en gestión / cotizado / cerrado, y ficha nueva `/central/derivados/[id]` con la ruta del
contacto y el historial de gestión del comercial en modo lectura.

**Por qué:** la etapa de la oportunidad mentía — `asignar_lead` la crea en 'asignada' con
la propia derivación, así que un contacto abandonado y uno recién derivado se veían igual.
La señal verdadera son las ACTIVIDADES. Con datos reales del 27-08: de 103 derivados en 30
días, 32 no tenían ninguna gestión y 27 llevaban más de un día así.

**How to apply:** el estado de atención de un derivado se calcula por actividades y
cotizaciones, nunca por `oportunidades.etapa`. Central no puede entrar a `/comercial/*`
(lo bloquea el layout), así que todo lo que necesite ver vive bajo `/central/*`.
**Falta desplegar** (igual que [[crm-cotizador-pantalla-propia]]). Ver
[[proyecto-crm-efameinsa]].
