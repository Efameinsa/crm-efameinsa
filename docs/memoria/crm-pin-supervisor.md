---
name: crm-pin-supervisor
description: "PIN rotativo de supervisor para que Central no corrija derivaciones sola — en producción desde el 27-08"
metadata:
  type: project
---

**En producción desde el 27-08** (commit ed175c7, migración 0093).

Pedido del ing. Carlos en la reunión del 27-08 con la analogía de la caja de
Plaza Vea. Corregir una derivación ya se podía (migración 0079); lo que faltaba
era que **no se pudiera corregir en silencio** — «si no, no vamos a poder medir».

**Cómo funciona:** código de 4 dígitos **por supervisor** (rol gerencia/admin),
derivado en la base de (semilla secreta + usuario + ventana de **10 min desde el
28-08**, migración 0110; eran 2 y no alcanzaban: «hasta que lo recibe ya expiró»). Gerencia
lo ve en su barra lateral **pidiéndolo** (no permanente: se iría en las demos
con pantalla compartida) con un relojito tipo token de banco. Vale también la
ventana anterior —viaja dictado por teléfono— y **se quema al usarse**: la
restricción única (supervisor, ventana). Ojo al efecto de la ventana larga:
cada supervisor entrega UN código cada 10 minutos, así que dos correcciones
seguidas necesitan dos supervisores distintos (hay cuatro). Motivo obligatorio: es lo que gerencia
va a leer para entender por qué se derivó mal.

**Candados verificados con `set role authenticated`:** `redirigir_lead` quedó
REVOCADA para authenticated (si no, la pantalla podría saltarse el PIN), la
semilla vive en `config_seguridad` con RLS y sin políticas, y hay tope de 5
intentos fallidos por usuario cada 10 minutos.

**Ojo con la numeración de migraciones:** hubo colisión — la otra sesión ya
había usado el 0092. Se renumeró a 0093 y se corrigió a mano la fila de
`_migraciones_aplicadas`. Antes de numerar una migración, mirar qué hay aplicado
en la base, no solo qué archivos hay en el repo.

**Para dictarle el código a Central sin esperar a que gerencia lo lea en su
pantalla:**  en el
repo del CRM — muestra el vigente, el de la ventana siguiente (el que conviene
dictar), los intentos fallidos y las autorizaciones ya usadas.
