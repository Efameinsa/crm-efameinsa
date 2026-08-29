---
name: crm-ruta-mantenimiento-filtros
description: "La ruta de mantenimiento se trabaja por tandas: tres filtros que se cruzan y los tres datos de la llamada en cuadros con color"
metadata: 
  node_type: memory
  type: project
  originSessionId: f45e7f8f-fea2-4caf-a65f-21983e184bfe
  modified: 2026-08-29T17:17:07.225Z
---

Rediseño del **29-08-2026**, pedido por gerencia mirando la pantalla: «el botón
ficha es muy pequeño, si compró o no no es tan visible, así como último
mantenimiento; debería poder filtrarse también por último mantenimiento,
compró, llamada, para poder buscar por ahí oportunidades… son letras pequeñas
que no se ven con facilidad».

**La idea que ordena todo: una campaña se trabaja por TANDAS, no fila por
fila.** El orden pone algo arriba pero no saca de la lista lo que hoy no toca.
Por eso hay tres ejes que se cruzan con Y —mantenimiento, compró, llamada— y
tres atajos de un clic («nunca le hicimos mantenimiento», «mantenimiento
vencido», «compró hace 2+ años y nunca se le llamó»). Con el primero, Ariana
pasa de **250 por llamar a 77 con argumento**.

Los tres datos que deciden la llamada dejaron de ser cifras de 10 px a la
derecha: son **tres cuadros con color propio** y rótulo entero — rojo cuando
NUNCA se le hizo el preventivo, ámbar vencido (6+ meses), verde al día, gris
punteado sin registro— más una barra del mismo semáforo al costado de la
tarjeta. «Ver ficha» es un botón del porte de los otros tres.

La decisión vive en `src/lib/ruta-mantenimiento.ts` (`estadoMantenimiento`,
`estadoCompra`, `estadoLlamada`, `filtrarRuta`, `haceCuantoDias`) con pruebas;
la barra en `components/crm/filtros-ruta.tsx`; la tarjeta en `fila-ruta.tsx`.

**«Nunca» y «no registrado» no son lo mismo y no se pueden mezclar**: «nunca»
se puede afirmar en la llamada; «no registrado» solo dice que el equipo no está
fichado, y afirmarlo sería inventarle un argumento a quien llama.

Relacionado: [[crm-postventa-procedimiento]], [[proyecto-crm-efameinsa]].
