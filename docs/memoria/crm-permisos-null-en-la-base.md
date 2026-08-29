---
name: crm-permisos-null-en-la-base
description: "«if not es_backoffice()» no entraba con null y dejaba pasar a quien no tiene perfil: 14 funciones, arreglado en la 0127"
metadata: 
  node_type: memory
  type: project
  originSessionId: f45e7f8f-fea2-4caf-a65f-21983e184bfe
  modified: 2026-08-29T17:17:36.637Z
---

Encontrado el **29-08-2026** investigando por qué el ing. Carlos no podía
rechazar un precio bajo lista. Migración **0127, ya aplicada en producción**.

`es_backoffice()` era `rol_actual() in ('gerencia','admin')`, y **`null in (…)`
es `null`**, no `false`. En plpgsql `if not null then` **no entra**, así que el
control

    if not es_backoffice() then raise exception 'Solo gerencia…'

dejaba pasar a quien no tiene perfil. Comprobado contra producción: una llamada
**sin ninguna sesión** atravesaba el control de gerencia de
`resolver_aprobacion_cotizacion` y llegaba hasta el paso de escribir. La clave
anónima vive en el navegador de cualquiera. Eran **catorce funciones** con el
mismo patrón (crear_cotizacion, registrar_venta, emitir_informe,
reasignar_cartera…) y se arreglaron todas con `coalesce(…, false)`.

**Regla:** toda función de permiso devuelve sí o no, nunca «no se sabe».

**Y lo otro que se aprendió del mismo caso:** un `raise exception` de permiso
tiene que decir **con qué cuenta se está entrando**. La pantalla se protege por
rol al abrirla, una sola vez; el clic viaja después con la cookie que el
navegador tenga en ese momento, y **la cookie es una sola para todas las
pestañas**. Se verificó de punta a punta que las dos cuentas de gerencia
(kycabrejos@ y crcabrejos@) **sí pueden aprobar y rechazar** —incluido un
rechazo real sobre la cotización que estaba esperando, dentro de una transacción
deshecha—, así que ese aviso solo pudo salir de una sesión que en ese instante
no era de gerencia.

Scripts: `scripts/_verificar-aprobacion-gerencia.mjs` (sondea sin escribir) y
`scripts/_verificar-rechazo-gerencia.mjs` (rechazo y aprobación completos sobre
cotizaciones de práctica, que borra al terminar).

Relacionado: [[verificar-antes-de-confirmar]], [[proyecto-crm-efameinsa]].
