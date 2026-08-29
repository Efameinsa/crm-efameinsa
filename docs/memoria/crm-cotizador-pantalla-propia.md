---
name: crm-cotizador-pantalla-propia
description: "Rediseño del cotizador del CRM: pantalla propia /cotizar con autoguardado, en producción desde el 27-08"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2080628a-b05c-4f6b-bf69-aaab198792c6
  modified: 2026-08-27T13:14:58.620Z
---

El **27-08-2026** se rehizo la navegación del cotizador (reemplaza al plan
antiguo de «mover el panel de Cotizaciones a la derecha», que resultaba
insuficiente). Tres decisiones que tomó Darwin, ya implementadas en local:

1. **Armar la cotización es una pantalla propia**:
   `/comercial/oportunidades/[id]/cotizar` (nueva) y `.../cotizar/[cotizacionId]`
   (corregir un borrador). La ficha de oportunidad ya no lleva el formulario.
2. **La lista de cotizaciones abre la columna derecha**, compacta, ARRIBA de Calificación y
   Etapa, con el botón «Nueva cotización» arriba.
3. **Autoguardado real**: la fila de `cotizaciones` nace en la base con el
   PRIMER equipo y se reescribe con cada cambio (600 ms de debounce). Quitar el
   último equipo BORRA el borrador. El aviso a gerencia salió del guardado y
   ahora vive en `finalizarCotizacion`, para no mandarle una campanada por tecla.

**Estado: EN PRODUCCIÓN desde el 27-08 por la mañana** (commits 4513991 y
6450ca1 en main). Darwin decidió desplegar en caliente, con los comerciales
trabajando, en vez de esperar al cierre. Ver [[proyecto-crm-efameinsa]].

**Cuidado al probar en local:** `.env.local` apunta a la Supabase de
PRODUCCIÓN (proyecto oyycfgqfddftxoxmqgqa). Probar con la cuenta de práctica
(`perfiles.es_prueba`, migración 0072) y borrar los borradores que queden.

**Pendiente detectado, no corregido:** `editar_cotizacion` decide la aprobación
solo por `bajo_lista`, mientras que `crear_cotizacion` usa
`exige_aprobacion_gerencia()` (que además exige aprobación para un equipo SIN
ningún precio cargado). Con el autoguardado eso se nota más: un equipo sin
precio entra como `pendiente_gerencia` al crearse y vuelve a `auto_aprobada` en
el siguiente guardado. Se arregla con una migración chica del mismo estilo que
la 0074.

**Vocabulario (27-08, corrección de Darwin):** el CRM **no envía nada**. El
botón decía «Enviar al cliente» y es mentira: lo que hace es asignar el
correlativo y cerrar el documento. Ahora dice **«Confirmar cotización»**, y el
envío al cliente va por fuera (correo o WhatsApp, con el PDF). En la lista del
comercial el estado `enviada` se rotula «Confirmada». **Las pantallas de
gerencia y Central siguen diciendo «enviadas»** (carga-cotizaciones, historial
de aprobaciones, campana) — falta decidir si se barre ese vocabulario también.

**«Próxima acción» dejó de ser panel:** era un eco de solo lectura de algo que
se escribe en «Registrar gestión» y que ya sale en Mi día, Mi agenda y la tabla
de oportunidades. Pasó a una línea en la cabecera de la oportunidad, y cuando
falta sale en ámbar («Sin próxima acción»), que es justo lo que mide la
supervisión diaria.

**Trampa aprendida (27-08, commit e157320):** `revalidatePath()` dentro de una
Server Action **refresca el árbol de la ruta actual**. Como el autoguardado
mueve la URL a `/cotizar/<id>` con `replaceState`, ese refresco resolvía otro
segmento de ruta y **volvía a montar la pantalla entera** — la ventana de
equipos se cerraba sola al elegir el primer equipo, y al confirmar salía «esto
ya no se puede mostrar» en vez del número y el PDF. Regla: **el autoguardado no
revalida nada**, y `/cotizar/<id>` de una cotización ya confirmada dibuja el
panel de confirmada en vez de tratarla como enlace muerto.

**Trabajo en paralelo:** el 27-08 hubo otra sesión commiteando en el mismo
repo (postventa, fotos por color de los coches). Antes de commitear conviene
`git diff origin/main` y no solo `git diff HEAD`: la copia de trabajo puede ser
ANTERIOR a lo que ya está en origin y un commit descuidado revierte lo ajeno.

**«Reu online» (27-08, commit 00d5bd6, migraciones 0089/0090):** `tipo_actividad`
es un ENUM de Postgres — agregar un tipo de gestión nunca es solo la UI. Y hay
**dos funciones que listan a mano qué gestiones cuentan como contacto real**:
`supervision_diaria` (llamada/whatsapp/email/visita) y `reporte_diario_comercial`
(+showroom). Todo tipo nuevo que sea contacto con el cliente tiene que entrar en
esas listas o el comercial aparece sin actividad ante gerencia. Los chips de
«¿Qué hiciste?» se dejaron como chips (no combobox): un clic dentro de un
registro de ≤15 s, con jerarquía en dos grupos y el rótulo «No cuenta como
contacto» sobre filtro/nota/otro.
