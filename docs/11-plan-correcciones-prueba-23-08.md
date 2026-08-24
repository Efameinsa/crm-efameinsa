# Plan 11 — Correcciones de la prueba de Darwin (domingo 23-08, cuenta C5)

**Fuente:** `Downloads/corregir-crm.txt` (transcripción de la prueba que Darwin grabó el domingo 23-08 ~20:30 desde su casa, navegando con la cuenta de Katerine C5). Los datos de esa prueba **ya se borraron** el lunes 24-08 por la mañana (`scripts/limpiar-pruebas-fin-de-semana.mjs` + `scripts/restaurar-oportunidades-pruebas-finde.mjs`) — pero los rastros que dejó en la base **confirmaron** varios de los bugs de este plan antes de borrarse. Donde diga "verificado en BD" es eso.

**Prioridad declarada por Darwin:** «la parte más relevante es mis oportunidades, que ahí es donde se va a empezar a gestionar el comercial. Levantar esas observaciones.» → El Bloque A va primero.

---

## Cómo trabajar (leer antes de tocar nada)

1. **La base es PRODUCCIÓN y el equipo real ya la usa desde hoy lunes** (capacitación 24-08 9:30 AM; los comerciales dejan el Excel y trabajan solo en el CRM). No crear datos de prueba sin tomar antes un snapshot (`select now()` en Postgres) y anotarlo. Al limpiar, censar **todo lo tocado** con `updated_at > snapshot` en `oportunidades` y `realizada_at > snapshot` en `actividades` — NO basta filtrar por `origen='crm'`: ese fue exactamente el hueco que dejó residuos el 22-08 (una venta falsa de US$ 21.500 viva en el embudo). Referencia: `scripts/restaurar-oportunidades-pruebas-finde.mjs`.
2. **No tocar:** el correlativo `EFAMEINSA-2026` (está en 2181; los gaps de numeración son normales y Darwin ya decidió no resetear), la cotización real 2178 (de Katerine, del jueves), ni nada con `origen='historico_excel'` salvo lo que un ítem pida explícitamente.
3. `cotizaciones`/`cotizacion_items` tienen trigger de inmutabilidad (migración 0012): para borrar en scripts, `set local session_replication_role = replica` dentro de una transacción.
4. **Verificación:** cada ítem se da por cerrado solo probado con sesión real (magic link o credenciales de `Downloads/credenciales-crm-efameinsa-2026-08-22.txt`) contra `next start` local Y contra `crm-efameinsa.vercel.app`. Build + lint no alcanza — es el estándar de este proyecto.
5. Todo el UI en español. Granate de marca `#7E1210`. Zona horaria del negocio: **America/Lima**.
6. Commits pequeños por ítem o por grupo, mensajes en español como los del historial.

---

## BLOQUE A — Funcional crítico (lo que bloquea la gestión diaria)

### A1. Registrar una gestión NO guarda la próxima acción → la agenda queda vacía 🔴 (el bug más importante)

**Síntoma (transcripción):** Darwin registró en YARINGAÑO MENDOZA (Lavandería Buenos Aires) una gestión "envié correo de cotización" con qué sigue = "llamar" para el 29-08. En el historial solo apareció el correo; en Mi agenda, el día 29 no apareció nada, ni recargando.

**Verificado en BD (24-08 antes de limpiar):** la oportunidad `cdeba132` quedó con `proxima_accion = null` y `proxima_accion_at = null` después de su gestión. O sea, no es que la agenda no lo muestre: **la escritura nunca ocurrió (o fue pisada)**. La agenda SÍ lee próximas acciones de oportunidades (`src/app/(app)/comercial/agenda/page.tsx:32-45`) además de `tareas_agenda`.

**Dónde mirar:**
- `src/lib/acciones/oportunidades.ts` — `registrarGestion` (~línea 56): el `update` pisa **siempre** `proxima_accion`/`proxima_accion_at` con lo que llegue del cliente, aunque llegue vacío (`datos.proximaAccion || null`). Si el flujo del formulario dispara un registro sin próxima acción (o dos registros, como sugieren las 2 actividades a las 20:17:20 y 20:17:49 con 29 s de diferencia), el segundo borra lo del primero.
- Además el `update` **no guarda `proxima_accion_hora`** aunque la columna existe y la agenda la lee.
- `src/components/crm/registro-rapido.tsx` — el Paso 3 vive dentro de `{expandido && …}`: revisar qué manda el cliente cuando el usuario escribe la acción y elige fecha, y si hay algún camino que registre sin incluirla.

**Arreglo esperado:** (a) reproducir el flujo exacto de la transcripción y corregir la causa raíz; (b) que el `update` no pise una próxima acción existente con null salvo intención explícita del usuario; (c) guardar también `proxima_accion_hora`; (d) que el historial muestre la próxima acción registrada (ver C4).

**Prueba de aceptación:** registrar gestión con "llamar, 29-08, 10:00" → recargar → la ficha muestra la próxima acción, y Mi agenda día 29 la muestra junto a las tareas personales.

### A2. La vista Kanban de Mis oportunidades sale vacía 🔴

**Síntoma:** en tabla C5 ve todo (15.7k: asignadas 815, filtradas 7.925, seguimiento 4.509…); al cambiar a Kanban «no aparece ninguna etiqueta, ninguna de asignada, ninguna de filtrada… no se ve el trabajo que tienen que realizar».

**Dónde mirar:** `src/app/(app)/comercial/oportunidades/page.tsx:84-116` (rama `vista === "kanban"`, construye `datos` desde `filas`) y `src/components/crm/pipeline-kanban.tsx`. Antecedente: el 18-08 se cambió la query del kanban a "abiertas completas + cerradas últimos 90 días" porque las 1.110 históricas desplazaban a las abiertas (tope 1.000). Sospecha: algún filtro (¿`origen='crm'`? ¿tope? ¿columnas que solo se pintan con datos?) deja el tablero sin tarjetas ni columnas cuando todo es histórico.

**Arreglo esperado:** «lo que está en tabla también debe de verse en Kanban» (palabras de Darwin), respetando los filtros activos. Ojo al rendimiento: con 15.7k filas no se puede hidratar todo en el cliente — paginar/limitar por columna (p. ej. las N más recientes por etapa + contador total en el encabezado de columna) es aceptable, pero las **columnas con su etiqueta y su conteo deben verse siempre**.

### A3. El buscador de equipo del cotizador no funciona 🔴

**Síntoma:** en la ficha, sección Cotizar (Efameinsa), el campo "buscar equipo" por código o marca ("LG", "Segmax 15") no muestra ningún autocompletado. El combo "elegir equipo" (65 equipos) sí funciona.

**Dónde mirar:** `src/components/crm/cotizador.tsx`.

**Prueba:** teclear "LG" → aparecen solo los LG; "CK120" → aparece el equipo.

### A4. Al elegir producto en el combo aparece el UUID 🟠

**Síntoma:** al seleccionar "CK120 — secadora industrial" el control muestra `6772E6BF-CC07-…`. «Malogra la experiencia; no sabe si lo marcó bien.»

**Dónde mirar:** `src/components/crm/cotizador.tsx` — el `Select`/combobox está mostrando el `value` (id) en vez del label del producto tras la selección.

### A5. Fechas mostradas en UTC, no en hora de Lima 🟠

**Síntoma:** registró la venta el **domingo 23-08 a las 20:29 (Lima)** y en "Compras anteriores" salió **24-08** (la venta se guardó como `2026-08-24T01:28Z` — verificado en BD). En la transcripción lee además algo como "2408 de 1996": revisar también el formato con que se pinta (posible fecha inválida/`Invalid Date` renderizada).

**Arreglo esperado:** auditoría de TODOS los lugares donde se pintan fechas de cara al usuario (compras anteriores, historial, informes, cotizaciones, agenda, mi día): formatear siempre en `America/Lima` con formato `dd/mm/aaaa`. Centralizar en un helper si no existe.

### A6. "Mi día" aparece vacío por defecto 🟡 (verificar antes de tocar)

**Síntoma:** «En mi día supuestamente están todos los pendientes para hoy. Aparece por defecto vacío.»

**Contexto:** `src/app/(app)/comercial/page.tsx:178-192` filtra a propósito para que las ~miles de históricas con `proxima_accion_at` viejo no inunden la vista (hay comentario en el código explicándolo). Puede que "vacío" fuese correcto ese domingo (sus tareas eran para otros días). **Primero diagnosticar** qué muestra hoy con datos reales de un comercial; si con A1 arreglado las próximas acciones nuevas aparecen, puede que no haya nada que tocar. Si de verdad omite pendientes de hoy, corregir la query. Documentar la conclusión en el commit.

---

## BLOQUE B — Informe de cierre y cotizador (formulario `src/components/crm/formulario-informe.tsx`)

### B1. Modalidad de pago: opciones que no se desmarcan 🟠

Contado + crédito + 50% adelanto quedan marcadas a la vez (`useState<string[]>` con `modalidad.includes(m)`, línea ~136/417). **Deben ser mutuamente excluyentes** (al marcar una se desmarca la otra), como ya hace "formas de pago" («muy bien, se va desmarcando»). El campo de texto libre para combinaciones ("50% adelanto y saldo contra entrega") **se queda** — eso Darwin lo aprobó.

### B2. Fecha de entrega: solo calendario, sin texto libre 🟠

Quitar la opción de texto libre; dejar únicamente el selector de calendario (`selector-fecha.tsx`, el mismo "calendario bonito" que ya se usa en otras partes) con su icono. **Nota de decisión:** Carlos había pedido el texto libre; Darwin lo revierte explícitamente («no entiendo la justificación, mejor con el calendario»). Dejar constancia en el commit de que es decisión de Darwin del 23-08. El modo "por confirmar" (Bloque B del plan 10) no se toca.

### B3. Hora de entrega: solo selector de hora, y que abra al mediodía 🟠

Quitar el texto libre; dejar solo el selector (`selector-hora.tsx`) con icono de reloj. La lista empieza en 00:00 pero **la vista debe abrir posicionada ~12:00–13:00** (las horas frecuentes), no en 00:00. «Darle una pequeña revisión de las mejores prácticas de UI/UX.»

### B4. "¿Quién recibe?": opción «Otro» que se guarda como contacto 🟠

Hoy sale por defecto el contacto (María Rocío). Agregar opción "Otro": nombre + DNI (+ teléfono si se quiere), y **ese otro se guarda como contacto de la cuenta** para la próxima vez.

### B5. El combo «presupuesto del archivo de este cliente» confunde 🟠

Al crear el informe, el combo ofrece presupuestos del archivo histórico ("14/08/2026 — dos equipos", "4/08 — un equipo") y Darwin no entendió qué era ni por qué su venta recién registrada no era lo primero. Arreglos:
- La venta/cotización **recién registrada debe venir preseleccionada** (o primera, marcada "— hoy").
- Renombrar el label a algo autoexplicativo (p. ej. «¿De qué venta es este informe?» con las opciones tipo «Cotización 2182 — hoy, 1 equipo» / «Del archivo histórico: 14/08/2026, 2 equipos»).
- Si se llega al informe desde el botón de una venta concreta, no preguntar: prellenar.

### B6. Alerta no bloqueante si un equipo va sin precio 🟡

El PDF le salió "Monto total: 0,00" porque no puso precio. Al generar el borrador, si algún ítem no tiene precio: aviso visible («El producto X no tiene precio») **sin impedir** generar — puede ser un regalo. Nada más.

### B7. El PDF del informe no pinta fecha, nº de operación ni banco 🟠

Campos llenados en el formulario que no aparecen en el PDF generado: **fecha** (de la venta/informe), **número de operación** y **banco**. Revisar la plantilla del PDF del informe (misma función que genera el borrador; ver `src/lib` donde viva `informe` + pdf-lib) y pintar todo campo que el formulario capture. Aprovechar para verificar campo por campo formulario→PDF.

### B8. Numeración de informes: arrancar en Nº 1 🟠

El borrador sale "sin enumerar" (correcto: el número se asigna al emitir). Pero los contadores quedaron avanzados por las pruebas ya borradas: `INFORME-EFAMEINSA-2026 = 2` e `INFORME-OPEN-2026 = 4`. Darwin pidió: «cuando esto funcione, por defecto que corra ya el informe número 1». **Resetear ambos contadores a 0** en `correlativos`, verificando ANTES que no exista ningún informe emitido (`select count(*) from informes_cierre` debe dar 0 — hoy 24-08 por la mañana daba 0). Si ya hay informes reales al momento de ejecutar, NO resetear y avisar. Los correlativos de cotización NO se tocan.

### B9. Mostrar la moneda en el cotizador al armar la cotización 🟡

Al agregar el ítem se ve "21.500" sin unidad clara. Mostrar USD / S/ junto al precio unitario y al total en el formulario de creación (en el PDF ya sale bien).

---

## BLOQUE C — UX, orden y semántica

### C1. Reordenar el formulario de gestión: «¿Qué sigue?» no es eso 🟠

En `registro-rapido.tsx`, el Paso 3 "¿Qué sigue?" muestra los chips de **resultado** (sin interés, no contestó, quedó en responder, pidió cotización, evaluando, quiere comprar) — que responden a "¿qué pasó?", no a "qué sigue". Lo que sigue es la próxima acción (llamar, visitar…) que hoy vive debajo, mezclada. Reorganizar:
- **Paso 1 ¿Qué hiciste?** → tipo (correo, llamada…) — como está.
- **Paso 2 ¿Qué pasó?** → nota + chips de resultado (mover aquí los chips).
- **Paso 3 ¿Qué sigue?** → próxima acción + fecha + hora.
Mantener el comportamiento de que elegir resultado sugiera la próxima acción sin pisar lo escrito (comentario existente en línea ~89).

### C2. Orden del sidebar del comercial 🟡

`src/components/crm/nav-lateral.tsx`. Orden pedido: **Mi día → Mi agenda → Mis oportunidades → Mi gestión → Mi cartera** (hoy Mis oportunidades no está tercero).

### C3. Agenda semanal desmaquetada 🟡

Columnas lunes–viernes de anchos desiguales y demasiado grandes (vista semanal; `agenda-mensual.tsx` o el componente semanal que corresponda en `agenda/page.tsx`). Igualar anchos (grid de columnas iguales) y compactar.

### C4. El historial no muestra la próxima acción registrada 🟡

Tras registrar la gestión, el historial muestra solo la nota («envié correo de cotización») pero no el «→ sigue: llamar el 29/08». Mostrar la próxima acción como parte de la entrada del historial (o entrada propia). Va de la mano con A1.

### C5. Ficha pequeña vs «Ver ficha completa»: consolidar 🟠 (proponer antes de codificar)

Hoy hay dos vistas del cliente: la que abre la oportunidad (con gestión, calificación, cotizador) y "Ver ficha completa" — que en realidad tiene **menos** cosas (informes de cierre, resumen, contactos) y confunde («ni siquiera está completa… eso confunde al vendedor»). Además "Registrar venta" está en una y no en la otra. Idea de Darwin: una sola vista, con lo diferencial integrado quizá como panel/modal a media página (como la animación de agregar en Mi agenda).

**Cómo trabajarlo:** NO codificar directo. Presentar a Darwin 2 opciones concretas (p. ej. ① todo en la vista de oportunidad con secciones colapsables y eliminar la ficha; ② mantener una sola "ficha del cliente" y que la oportunidad abra como panel sobre ella) con mockup o descripción clara, y que él elija. Es un cambio estructural de navegación.

---

## BLOQUE D — Decisiones de negocio (validar, no asumir)

### D1. Orden del pipeline

Darwin duda del orden actual (asignada → filtrada → cotizada → seguimiento → potencial → …): «yo supongo que debería ser seguimiento y después potencial… solamente hay que validar que este es el pipeline o la ruta correcta del negocio». **No cambiar nada por ahora**: preparar un mini-resumen (una pantalla) del orden actual y su semántica (viene de los estados P1/P2/P3 y C1–C4 del Excel) para que Darwin lo valide con Carlos. Si deciden cambiarlo, es migración de datos + kanban + embudo de gerencia — dimensionar aparte.

---

## Orden de ejecución sugerido

| Orden | Ítems | Por qué |
|---|---|---|
| 1 | A1, C4, C1 | El corazón de "mis oportunidades": registrar gestión y que se refleje en agenda/historial. Mismo componente, un solo frente. |
| 2 | A2 | Kanban vacío: los comerciales lo van a ver hoy mismo. |
| 3 | A3, A4, B9 | Cotizador usable de punta a punta. |
| 4 | B1–B8 | Informe de cierre completo (el 8 al final, es un script de un minuto). |
| 5 | A5, A6, C2, C3 | Fechas, mi día, sidebar, agenda visual. |
| 6 | C5, D1 | Requieren decisión de Darwin/Carlos antes de codificar. |

**Ojo con el deploy:** hoy lunes es el primer día real del equipo. No deployar a media mañana algo a medio verificar; agrupar en deploys verificados. Los ítems 1–2 son los más urgentes porque tocan lo que los comerciales usan desde hoy.
