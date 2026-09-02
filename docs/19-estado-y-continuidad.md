# Estado del CRM y cómo continuar

**Escrito el 28-08-2026, al cambiar de cuenta de trabajo.** Este documento es el
punto de entrada: quien llegue nuevo lee esto primero y con eso puede seguir sin
preguntar lo que ya está decidido.

Lo demás vive en el repositorio y en la base. Nada importante depende de una
conversación: si algo solo estaba en un chat, es que faltaba escribirlo.

---

## 1. Qué es esto y en qué punto está

CRM a medida para EFAMEINSA (equipos de lavandería industrial, Perú), en
**producción y en uso diario** desde el 25-08-2026 en **https://crm.efameinsa.com**.
Reemplazó el Excel por vendedor + el maestro de Central.

No es un piloto: hay comerciales cotizando, Central derivando contactos y
cierres de venta emitiéndose todos los días. **Cada cambio toca datos reales.**

| | |
|---|---|
| Clientes | ~16.300 cuentas, ~13.900 contactos |
| Contactos históricos | ~39.400 leads |
| Catálogo | 147 productos (121 activos), todos con ficha, precio y foto |
| Cotizaciones | ~25.500 oportunidades cargadas |
| Cierres de venta emitidos | EFAMEINSA 001, OPEN 001–005 (correlativos arrancados el 28-08) |

**Stack:** Next.js 16 (App Router, Turbopack) · Supabase (Postgres + Auth + RLS +
Storage) · Vercel · Tailwind + shadcn/ui · vitest · @react-pdf/renderer.

---

## 2. Quién es quién

| Persona | Cuenta | Qué hace |
|---|---|---|
| **Ing. Carlos** | gerencia | Gerente. Decide las reglas de negocio. Las reuniones con él son la fuente de verdad. |
| **Santos Vilcachagua** | gerencia | Gerencia comercial. Los documentos hacia gerencia se firman con su nombre. |
| **Darwin** | admin | Quien desarrolla y administra el CRM (el usuario de estas sesiones). |
| **Central** | `central@efameinsa.com` | Recibe TODO contacto entrante y lo deriva. Emite pedidos y libera cierres. |
| **Lesly** | `lesly@efameinsa.com` | **Operaciones** (rol propio, migración 0115). Autoriza, reparte permisos, mantiene el catálogo y el maestro de precios. |
| **Brenda Taboada** | C1 (antes C8) | Comercial. Fue postventa 5 años: el histórico de postventa es suyo como C8. |
| **Katerine Tello** | C5 | Comercial. |
| **Ariana Flores** | C4 | Comercial que además vende mantenimiento y repuestos. |
| **Postventa** | `postventa@efameinsa.com` | Hever. Ejecuta despachos, puestas en marcha y garantías. |

Hay además cuentas de **práctica** (`central0@`, `comercial0@gmail.com`,
`postventa2@`) aisladas por `es_prueba` / `es_cuenta_prueba()`: sirven para
capacitar sin ensuciar reportes.

---

## 3. Las reglas que no se rediscuten

Salieron de reuniones con gerencia; están en `docs/01`, `03`, `06`, `10`, `13`,
`18` y en las cabeceras de las migraciones. Las que más se olvidan:

1. **El catálogo es sagrado.** Los productos, sus fichas y sus precios salen del
   maestro de Lesly (`CODIFICACION DE EQUIPOS PARA MARKETING.xlsx`, columna
   «VALOR DE VENTA»). **No se tocan datos de productos para probar nada.** Si
   una verificación necesita un producto, lo crea y lo borra.
2. **Anular, no borrar.** Un cierre equivocado se anula: queda el documento con
   su número, deja de contar y el correlativo sigue. Vale para todo lo que ya
   salió a un cliente.
3. **El comercial no corrige lo suyo.** Toda corrección la ejecuta Central o
   gerencia con el código de autorización del supervisor (dura 10 minutos).
4. **La serie del equipo es el eje de la trazabilidad.** La misma serie viaja
   del almacén al cliente y de ahí a `equipos_instalados` con su garantía.
5. **Los precios se versionan**: cambiar uno vence el vigente y abre otro; el
   histórico es lo que el cotizador usa para decirle al comercial a cuánto se
   le vendió antes a ese cliente.
6. **Registrar una gestión tiene que costar ≤15 segundos.** Es la regla de
   adopción: si algo tarda más, no se usa.

---

## 4. Lo que se construyó en la última tanda (26 al 28-08)

Cada una tiene su migración con la explicación completa en la cabecera.

**Postventa** (`docs/13`, `16`, `17`): el caso arranca por la serie del equipo,
calendario, ruta de mantenimiento, precios tapados para quien no debe verlos, e
importación de 390 cierres de postventa de los Word de `R:\`.

**Central** (`0107`, `0110`): derivar un contacto ya no le quita el cliente a
nadie en silencio — avisa y pide el código del supervisor. La cola de cierres se
escanea y el expediente se abre en un modal.

**Operaciones — el puesto de Lesly** (`0114`–`0121`): rol propio; dicta el
código que autoriza anular un cierre y corregir una derivación (pero **no**
traspasar cartera, que sigue en gerencia); reparte el permiso temporal para que
un comercial cotice mantenimiento; mantiene el catálogo y las listas del
sistema.

**El catálogo de operaciones** (`/operaciones/catalogo`): se busca con la MISMA
función del cotizador (`buscarEquipos`), cada equipo abre su **hoja técnica tal
como sale impresa** y editable encima, con vista previa del PDF real. El
catálogo es también el almacén: el stock se ve en la tarjeta.

### Lo del 29-08 (pedidos de gerencia, mirando la pantalla en vivo)

**Ruta de mantenimiento, rediseñada** (`/comercial/ruta`). Se pidió textual:
«el botón ficha es muy pequeño, si compró o no no es tan visible, así como
último mantenimiento; debería poder filtrarse también por último mantenimiento,
compró, llamada, para poder buscar por ahí oportunidades». Ahora los tres datos
que deciden la llamada son tres cuadros con color propio (rojo = **NUNCA** se le
hizo el preventivo, ámbar = vencido, verde = al día, gris = sin registro), la
tarjeta lleva ese mismo semáforo en una barra lateral, «Ver ficha» es un botón
del porte de los otros tres, y hay **tres filtros que se cruzan** —mantenimiento,
compró, llamada— más tres **tandas** de un clic. Con «nunca le hicimos
mantenimiento», Ariana pasa de 250 por llamar a **77 con argumento**. La decisión
vive en `src/lib/ruta-mantenimiento.ts` (`estadoMantenimiento`, `estadoCompra`,
`estadoLlamada`, `filtrarRuta`), con pruebas.

**El cuadro de corregir una cotización numerada.** Dos pedidos: «debe decir
cuántos caracteres debe tener la razón por la que se corrige» —el mínimo de 15
lo exige la base desde la 0123 y no se decía en ninguna parte— y «el estilo de
letra de los códigos me parece muy delgado». Ahora el motivo lleva contador vivo
(«13 de 15 caracteres mínimos» → «✓ 60 caracteres») y el pie dice qué falta en
vez de dejar el botón apagado y mudo. El código de cuatro dígitos pasó a ser
`src/components/crm/campo-codigo.tsx`: **cuatro casillas grandes en negrita**,
un solo `input` transparente encima (pegar, borrar y el teclado numérico siguen
funcionando). Se adoptó también en anular un cierre, asignar contacto y corregir
una derivación, en ámbar.

**La llave de gerencia** (`0127`, ya aplicada). Ver la sección 7: es la trampa
más cara del día.

### Lo del 01-09 (el día de las observaciones de gerencia y el feedback en vivo)

Todo desplegado y verificado; el detalle vive en `docs/27` (plan de la reunión
con citas) y en los commits del día. En una pasada:

- **Consolidación de expedientes gemelos** (0141, decidida por Carlos): el
  cliente que entra dos veces se SUMA al expediente abierto del mismo
  comercial; `leads.oportunidad_id` nuevo; gemelos vacíos fusionados; aviso a
  Central al juntar; el comercial ve «El cliente volvió a escribir por…».
- **La aprobación sobrevive a la edición** (0140): se pega al par
  equipo+precio (caso Gavina/Ariana). La ventana por días quedó como
  propuesta para Carlos.
- **Cierre emitido sellado** (0142): agregar documentos pide el código de
  operaciones/gerencia y queda firmado. Al EMITIR, checklist tipo por tipo de
  lo que falta (cotización/OC/voucher) — el bloqueo duro es decisión de Carlos.
- **Correlativos OPEN cuadrados**: la despensa del coordinador (plan 26) se
  retiró — **el plan NO está aprobado**, las funciones duermen en la base y
  nada las llama; Presu_569→528 renumerada. Los ensayos de correlativos van al
  banco de pruebas, nunca a la serie real.
- **Central**: vista de derivados sin banco de pruebas (salvo modo ensayo) y
  7 derivaciones de prueba borradas (respaldo en scripts/data/).
- **Postventa, la tanda grande de vistas** (feedback de Santos en vivo, 7
  despliegues): registro de contactos directos → cola de Central (la 0060 ya
  cubría a PV: es rol comercial); **Control de pedidos** en kanban de 3 fases
  con checklist estilo Asana (todos los pasos, fase actual resaltada, arrastre
  nativo que ENSEÑA qué falta en vez de mover, botón Aprobar en la tarjeta);
  ficha del pedido como tracking de encomienda (riel + documentos y datos a la
  derecha + barra de avance); Mi día con reloj humano («venció hace 4 días»),
  atrasados como bloque tocable y «Lo que viene esta semana»; en la atención,
  las **series del cliente con el clic que vincula y verifica garantía**
  (`equipos-de-la-atencion`, OJO: existe también `equipos-del-cliente`, que es
  OTRO componente — el parque en la ficha comercial), la ruta del contacto a
  la derecha, y el **circuito con pestañas navegables** (acta de lo hecho,
  anticipo de lo futuro, punto granate que late en la actual).

**Cosas que se arreglaron y conviene no volver a romper** están en la sección 7.

### Lo del 01-09 (tarde): la serie de práctica (0145)

Katherine (C5) mandó una captura: sus cotizaciones saltan de `Presu_2201-26`
a `Presu_2210-26`. Investigado con Santos: **los números 2202 a 2208 los
consumieron pruebas internas del 28-08** hechas con la cuenta «Comercial de
pruebas» (C0) entre las 08:34 del 26-08 (envío del 2201) y las 15:45 del
28-08 (envío del 2209 de Brenda); el ancla que quedó es el informe de cierre
de práctica 004-2026 de las 13:22, que exige una cotización enviada. La
limpieza de práctica de las 20:02 borró esas cotizaciones sin respaldo y el
contador no retrocede (0077). Se repitió el 29-08 a las 10:52 y 11:16
(`Presu_2210` y `2211` de práctica, borradas el 01-09 a las 09:54 — por eso
Katherine recibió el 2210 ese día). Los informes de cierre y de servicio
sufrían lo mismo (002 y 003 perdidos, 004 y 007 de práctica en la serie real).

**Migración 0145, aplicada el 01-09 a las 15:10:** las cuentas de práctica
(`es_prueba`) numeran en contadores propios y el código lo dice en la cara:
cotización `PRUEBA_1-26` (correlativo 900001+), informe de cierre
`PRUEBA-904-2026` (rango 900, el que ya usaba el banco de PV0), informe de
servicio 911+ (en pantalla «PRUEBA 911-2026»). Los contadores reales no se
mueven. Saneo: informe 004 huérfano y su cadena (servicio, equipo
`PRB-TEST-…`, informe de servicio 007) retirados; contadores reales de
informes puestos en el último emitido de verdad (EFAMEINSA 001 → el próximo
es 002; servicio → 001). El hueco 2202-2208 queda: 2209 y 2210 son reales.
Verificado de punta a punta con `scripts/probar-serie-de-practica.mjs`
(sesiones reales de C0 y PV0; se limpia sola). La limpieza
`limpiar-practicas-comercial.mjs` ahora también borra los informes de práctica
de C0/LOG2 con su cadena y avisa si algo de práctica lleva número real.
Lo de interfaz (el PDF imprime `PRUEBA_1-26`, las pantallas de servicio
anteponen «PRUEBA») sale en el despliegue de las 18:00.

**Para Katherine:** el número no es de cada comercial, es una sola serie por
empresa. Ninguna de las suyas se subió mal.

**Y la 0146, esa misma tarde, con la señorita de postventa al lado:** atendió
a NESSUS (llamó, mandó la cotización, dos gestiones en el caso a las 10:19)
y la atención seguía en «Sin atender todavía» con el reloj corriendo, porque
la bandeja miraba la etapa técnica y el reloj paraba recién en `atendido_at`
(el técnico ejecuta). Ocho abiertas, cinco ya gestionadas. Ahora
`atenciones.tomada_at`/`tomada_por` lo fija la base con la primera gestión
del caso ligado (trigger en `actividades`) o al avanzar la etapa; el reloj de
respuesta se detiene ahí; Mi día muestra «Atendidas hoy» con hora, tiempo de
respuesta y quién; Atenciones tiene filtros Sin atender / Atendidas. El
circuito de nueve etapas NO se mueve solo. Verificado en producción con
`scripts/_verificar-atendidas.mjs` (sesión real de PV).

**Y la 0147, el caso PERUVIAN NATURE:** «le hicieron preventivo y correctivo
este año y solo sale lo del 2024». Los dos trabajos de 2026 estaban en la
base como `servicios_postventa` (cola del Excel de Hever, 25-08) pero con
`cuenta_id` NULO: el Excel dice «S & S SAC» y la ficha «S & S S.A.C», y el
cruce del import era por nombre exacto. 123 de 186 servicios estaban sueltos;
la 0147 enlazó 35 por nombre normalizado cuando casa con UNA ficha; quedan 88
sueltos, 13 de ellos porque el cliente está partido en dos o más fichas
(AQUA EXPRESS, HORTIFRUT, PISCIS, LAVIPRONTO, NATUCULTURA, PERUBAR, SAN
AGUSTIN PARACAS…): se resuelven al fusionar. La ficha de la atención ahora
tiene «Lo que ya se le hizo a este cliente» (`historial-postventa-cliente`):
pedidos del Excel, informes de servicio, cierres y ventas de servicio, por
año. La «duplicidad» era la OPEN 854-25 dos veces en el archivo (una copia
renombrada «Presu_855-25 … - copia»); se retiró.

**Y la 0148, el caso SIERRA TRAVEL (01-09, 17:50):** Katerine cotizó dos
lavadoras (Presu_479-26, 6.000), vendió una (informe 011-2026, 2.250) y la
venta salió por 6.000 porque `registrar_venta` copiaba el total cotizado. Ahora
**el informe manda**: si hay informe emitido, la venta nace con su importe y
atada a él; si el informe llega después, el trigger de la 0105 corrige la
venta. La diferencia queda anotada en `ventas.notas` y el comercial la ve en
un aviso al registrar. La venta real se corrigió a 2.250. Detalle en
`docs/historial/19-venta-por-lo-que-dice-el-informe-0148.md`. **Pendiente:**
preguntarle a Katerine si la Titan Max (3.750) sigue viva, y decirles a los
comerciales que cuando venden una parte dupliquen la cotización con solo lo
vendido.

**Hallazgo colateral, SIN tocar:** el archivo `cotizaciones_historicas` tiene
**258 grupos** con el mismo número y dos archivos distintos (p. ej. correlativo
104 con «Presu_101-26, MENDOZA» y «Presu_104-26, CALLUPE»): el parser guardó
el número de adentro del documento y el nombre del archivo dice otro. Puede
esconder cotizaciones reales bajo el número equivocado y hace que la 0077
salte números que sí están libres. Pide un diagnóstico aparte antes de
corregir. El preventivo de PERUVIAN del 07-01-2026 existe solo como informe
en `X:\S. PRIVADO\PERUVIAN NATURE & S.A.C\2026`; ya quedó vinculado a la
ficha, pero se verá cuando Sistemas dé el puerto (`ARCHIVOS_URL`).

**Y dos más de esa tarde, sin migración:** (1) postventa buscó
«20138427014» (Congregación de Religiosas Mercedarias Misioneras, cartera de
Ariana) y no salía: Equipos, Despachos y la Ruta buscaban solo en el texto de
cada fila, nunca por RUC/DNI ni razón social de la ficha enlazada —
`lib/buscar-cuentas.ts` resuelve las fichas que casan y se suma
`cuenta_id.in.(…)` al `.or()`; la Ruta filtra por `numDoc`. Ojo: la Ruta la
encuentra en la pestaña «cerrados» (ya compró); la búsqueda no avisa en qué
pestaña está, mejora pendiente. (2) **«Queremos ver todo en postventa; luego
vemos cómo lo debe ver comercial»** (Santos): `veTodoPostventa(perfil)` en
`lib/postventa.ts` es UNA regla (gerencia, admin, es_postventa,
hace_postventa) para la agenda, casos anteriores, Mi día y la Ruta; la RLS
0124 ya lo permitía. Cómo lo ve comercial: pendiente de decidir.

### La tanda de la noche del 01-09 (desplegada a las 18:37; migraciones 0150, 0151 y 0152 aplicadas)

Sale de las tres grabaciones de la tarde (15:56, 16:27, 16:56) con Carlos y
Lesly; el plan con citas está en las cabeceras de la 0150 y de los archivos.

- **El circuito del pedido en el orden de Carlos** (`bloquesPedido`, 0150):
  ① confirmación de Finanzas (con quién y por qué medio; no traba nada) →
  aprobación → probado y embalado con fecha y hora → plano en paralelo;
  ② dirección Y quién recibe verificados → **apertura de despacho**, que solo
  se emite con las cuatro condiciones (el servidor las vuelve a verificar,
  `emitirAperturaDespacho`) → despacho, que sin apertura no sale; ③ igual.
  La ficha muestra la forma de pago del cierre arriba y el aviso de aprobar
  ya no tapa el riel. La apertura es una página imprimible:
  `/postventa/pedidos/[id]/apertura` (HTML → Edge → PDF, sin montos).
- **Mi día sin duplicados**: una derivación de Central creaba caso + atención
  (0132) y la bandeja listaba los dos (PERUVIAN, IRPE). Manda la atención.
- **Central → Presupuestos** (`/central/presupuestos`): listado con escala
  día/semana/mes/año y por comercial; `FiltroPeriodo` ganó `escalas`.
- **Comercial: filtro por rubro** en oportunidades y cartera
  (`filtro-rubro.tsx`, `consultas-rubro.ts`).
- **Stock semanal de Importaciones**: `scripts/cargar-stock-semanal.mjs` +
  `docs/28` (formato del Excel: CÓDIGO, STOCK, ALMACÉN opcional; ruta
  `V:\SANTOS\STOCK SEMANAL\`). Solo plan por defecto.
- **Curar nombres**: `scripts/reporte-servicios-sin-cliente.mjs` →
  `docs/servicios-sin-cliente.xlsx` (no se versiona) para Lesly, y
  `aplicar-servicios-sin-cliente.mjs` que lee su decisión.
- **El hueco 2202-2208 se rellena** (decisión de Carlos): migración 0151,
  aplicada a las 18:37: el contador EFAMEINSA quedó en 2201 y las próximas siete cotizaciones toman 2202-2208; 2209, 2210 y 2211 ya existen y se saltan solos.
- OJO: **otra sesión de esta misma carpeta** comiteó y desplegó la
  `0148_la_venta_se_registra…` a las 17:48; la mía pasó a 0150 (el registro
  en `_migraciones_aplicadas` se renombró). Verificar el último número antes
  de crear una migración sigue siendo la regla.

### Lo del 02-09 (mañana)

- **Word de gerencia `01.09.26.docx`** (Descargas): 4 observaciones. (1) El
  rubro se clasifica en la ficha del cliente, bloque de identidad; faltan
  reclasificar 6.858 «Sin rubro» del Excel. (2) Mi día: vencidas = próxima
  acción con fecha pasada, para hoy = fecha de hoy, recién asignadas = nunca
  tuvieron acción; depende de que el comercial la registre. (3) Piden que el
  comercial ENTRE al cierre a ver el detalle y que modificar pida PIN: hoy la
  fila abre el PDF y el expediente solo lo ve Central; **decisión de Carlos**
  si un informe emitido se corrige con PIN o sigue sellado. (4) 12 vs 13
  presupuestos del 01-09: la bandeja cuenta por `created_at` con borradores;
  Central por `enviada_at` con número. El 13.º es un borrador abandonado de
  Katerine (Tulumayo, 19:27, tres minutos antes del Presu_2210). Pendiente:
  que la bandeja no cuente borradores.
- **Acceso `admin@efameinsa.com`** creado con `scripts/crear-admin.mjs` (rol
  admin, sin marca de prueba). El admin viejo `admin@efameinsa-crm.local`
  sigue existiendo y no tiene historial: se puede borrar desde el panel.
- **Borrar usuarios desde /admin** (pedido de Santos: «admin puede desactivar
  cuentas pero también debe tener la opción de borrar»). `borrarUsuario` en
  `lib/acciones/usuarios.ts`: solo sale con una cuenta SIN historial; si tiene
  clientes, gestiones, cotizaciones, cierres, etc., responde con lo que tiene
  y manda a desactivar. La base lo protege igual (las FK a `perfiles` no
  tienen cascada) y el 23503 queda como red con el nombre de la tabla. Se
  llevan con la cuenta solo `accesos` e `intentos_pin_supervisor`. Ensayado
  contra la base real con una cuenta temporal.

### Lo del 02-09 (las cuatro observaciones del Word) — DESPLEGADO 09:47

Santos: «mapéalo, vamos a hacerlo y despliégalo todo… al final cuando te diga
desplegamos todo». Verificado con `scripts/_verificar-0209.mjs`,
`_verificar-base-excel.mjs` y `_verificar-correccion-cierre.mjs` (sesiones
reales; aceptan `BASE_URL=https://crm.efameinsa.com`), primero contra
`next dev -p 3005` y después contra producción. **Seis commits subidos en una
tanda a las 09:46 (44968b3…e32db38), Vercel READY 09:47, las tres pasadas
limpias en producción.** Migraciones 0153 y 0154 aplicadas; archivado de
fósiles corrido.

- **Punto 2, Mi día.** Lo que había detrás del «Vencidas 60» de Katerine:
  6.178 vencidas reales, de las que 6.163 son filas del Excel sin tocar. La
  migración 0130 se había aplicado pero `sanear-oportunidades-fosiles.mjs
  --aplicar` nunca se corrió. **Se corrió el 02-09 a media mañana** con la
  autorización de Santos: 20.426 oportunidades a `historico` (respaldo en
  `backups/oportunidades-fosiles-31-08.json`, reversa con `--revertir`);
  quedan 809 abiertas, y las vencidas reales son 24 (C1), 57 (C4) y 15 (C5).
  Producción lo reflejó al instante (el código de la 0130 ya estaba
  desplegado). Las 30 «para hoy» sí son trabajo real; 19 sin texto de
  próxima acción.
  Construido: pastilla «Excel» en la fila, «venció hace N días»
  (`src/lib/mi-dia.ts`), «Falta indicar qué hacer» en ámbar, cuatro acciones
  frecuentes de un toque en el paso 3 del registro rápido, resumen en la
  cabecera, y **«La base del Excel» al pie de Mi día** (decisión de diseño
  con Santos, 02-09): plegada por defecto con su número; «Abrir la base» la
  despliega ahí mismo (`?base=1`) con buscador por cliente, filtro por rubro,
  las 40 más recientes con pastilla «Excel», «venció hace…» y el botón
  **«Retomar»** (antes «Trabajar esta oportunidad»; misma palabra en la
  ficha y en Histórico). Retomar = seguimiento + próxima acción hoy; pasar a
  Potencial sigue siendo otro paso desde la ficha, a propósito: una intención
  no es una promesa a gerencia. La raya es «trabajado en el CRM», no «nacido
  en el CRM»: las 665 del Excel con gestión en el CRM siguen en Mi día.
  Panel de gerencia (CLTV, recurrencia con histórico) se queda como está.
- **Punto 3, Mis cierres.** Nueva `/comercial/cierres/[id]` (`VistaCierre`):
  el cierre como pantalla en DOS columnas —lectura a la izquierda (cliente,
  equipos con IGV, cómo se hizo la venta, correcciones) y consulta a la
  derecha (total, pago, entrega, contactos agrupados, expediente)—. Santos
  vio la primera versión «muy plana» y sin botón de editar; de ahí el
  rediseño y **«Editar»** en granate, grande, junto a «Ver PDF». Al tocarlo
  aparece el cuadro de motivo (15 caracteres) + código de Lesly/gerencia; el
  código ABRE media hora (**0154**, `correcciones_informe`, mismo flujo que
  la 0123) y la misma pantalla se vuelve formulario; guardar ya no pide nada.
  La base (**0153**) archiva la versión anterior entera en
  `informes_cierre_versiones`, recalcula el importe de los equipos y corrige
  la venta atada (0148). Serie, número, fecha, cliente y estado no se tocan.
  El candado `bloquear_edicion_informe` se parchó sobre la definición viva
  para aceptar `app.corrigiendo_cierre`. Un F5 a mitad de la corrección
  recupera la ventana viva (`correccion_informe_abierta`). Verificado con
  `scripts/_verificar-correccion-cierre.mjs` sobre PRUEBA-903-2026 (es de
  práctica; va por la versión 3). OJO: el código se quema por ventana de
  10 min, así que dos corridas seguidas del script necesitan esperar el
  código siguiente. **Decisión pendiente de Carlos**: si el PDF
  corregido debe declararse «versión 2» (la misma pregunta abierta de la
  0123). La fila de la lista abre esa vista; el PDF queda en el ícono. Brenda
  recibe 404 en un cierre de Katerine (RLS 0049).
- **Punto 4, bandeja.** `CargaCotizaciones` cuenta con el MISMO criterio que
  `/central/presupuestos` (número, enviada/aceptada, sin PRUEBA, por
  `enviada_at`); título «Presupuestos enviados por comercial», sin la columna
  «Enviadas (30 d)».
- **Punto 1, Lesly.** Ya tenía `/admin/catalogos` como «Listas del sistema»
  desde la 0118; lo que chocaba era el rótulo «Catálogos» del menú del admin.
  Renombrado.

---

## 5. Cómo se trabaja acá

**Migraciones.** Numeradas, en `supabase/migrations/`, con una cabecera larga
que explica POR QUÉ, citando a quien lo pidió. Se aplican con un script
`node --env-file=.env.local` contra `DATABASE_URL`. ⚠️ **Verificar el último
número antes de crear una**: han chocado tres veces por trabajar dos sesiones en
paralelo.

**Verificación.** No se da por buena una pantalla sin abrirla. El patrón de la
casa son scripts `scripts/_verificar-*.mjs` que:
- entran con **sesiones reales** de cada cuenta (magic link + `verifyOtp`),
- piden las páginas al servidor y afirman contra el **HTML que devuelve**,
- comprueban también **quién NO puede** hacer cada cosa,
- y **no escriben sobre datos reales**: crean lo suyo y lo borran.

Los PDF se verifican con `pdfjs-dist`, comparando texto y dibujos página por
página contra tres cotizaciones reales de referencia.

**Idioma.** Todo el dominio en español: tablas, columnas, rutas, UI, nombres de
funciones y comentarios. Los mensajes de la interfaz están escritos para quien
los va a leer trabajando, no para un programador.

**Commits.** En español, explicando el porqué y citando la frase de quien lo
pidió cuando la hay. Terminan con los dos trailers de coautoría.

**Los scripts `_`-prefijados no se comprometen**: son de trabajo.

---

## 6. Lo que quedó pendiente

De las reuniones del 28-08 y de la revisión del catálogo:

1. **Cargar el almacén de verdad.** `inventario_equipos` está vacía. Mientras
   tanto el stock que se ve es `ficha.stock_referencia`, la cifra que trajo el
   maestro (288 máquinas en 84 modelos), rotulada «(ref.)». Si Lesly entrega el
   Excel con las series, se importa.
2. **Editar una cotización ya numerada conservando el número** — el caso del
   leasing: al banco no se le puede cambiar el número. Ocurre 5 a 10 veces al
   año sobre 3.000 cotizaciones. Referencia que dio Carlos: como HubSpot, un
   editor antes de generar el PDF. ~~Falta construirlo~~ — **HECHO el 29-08
   (migración 0123)**: lo corrige el comercial dueño con el código de cuatro
   dígitos que dictan operaciones o gerencia; cada línea de la cotización es un
   botón que abre el buscador en modo reemplazar; se ve el antes/después y el
   PDF real antes de guardar; la versión anterior queda archivada entera.
   Diseño en `docs/20-corregir-cotizacion-numerada.md`, mockup en
   `docs/mockups/corregir-cotizacion.html`. **Quedan las tres decisiones de la
   §5** para llevarle a Carlos, sobre todo si el PDF corregido debe declararse
   como versión 2 (hoy no dice nada).
3. **La cuenta maestra de contraseñas**, y **quitarle al gestor la opción de
   cambiar la suya** («eso no va», Carlos, 28-08).
4. **Tres accesos que Carlos pidió**: un comercial, gerencia comercial y
   central, con usuario y contraseña.
5. ~~Ariana (C4) tiene ventas que no son suyas~~ — **RESUELTO el 29-08
   (migración 0124)**: eran 145 mantenimientos importados de los informes de
   R:\ (US$ 88.522 + S/ 139.493 aprox.), no 169. Pasaron a Post Venta (PV);
   la campaña de llamadas (103 oportunidades) sigue siendo suya. La vista de
   servicios ahora es **completa** para quien tiene la llave
   (`hace_postventa`, la reparte Lesly desde `/operaciones/permisos`): todo
   el histórico de mantenimientos, repuestos y el parque instalado — ver no
   es contabilizar. A Ariana la llave le queda abierta (es su oficio). Su
   primera venta ya está: **OPEN 010-2026, emitido el 29-08** (Congregación de
   Religiosas Mercedarias Misioneras, mantenimiento preventivo de su ruta,
   US$ 680 + IGV, presupuesto a mano 420-26) — la reserva de
   `correlativos_reservas` se consumió, el contador sigue en 5 y saltará el
   10\. Se registró directo en la base porque postventa aún no cotiza en el
   CRM; desde ahora todo lo suyo suma con normalidad.
   OJO: sus 385 ventas de `historico_excel` sin `documento_origen`
   (las del maestro de Lesly) **no se tocaron** — existían antes de la
   importación y no fueron el reclamo de Carlos; si gerencia quiere revisarlas,
   es una conversación aparte.
6. **Retirar el resultado de gestión `FUTURO`**, duplicado de `COMPRA_FUTURO`.
7. **Reconocer las redes seguras de la oficina** para el control de accesos, y
   pedir autorización cuando un laptop se conecta desde fuera.
8. **39 cierres de postventa** esperan confirmación humana en
   el Excel que genera `scripts/importar-cierres-postventa.mjs` (no se
   versiona: lleva nombres de clientes y montos). Eran 32; el 29-08 se
   sumaron 7 al cargar la carpeta «BRENDA 2023» — la llenaron con los 272
   informes de verdad (243 de 2023, 10 de fines de 2022) y entraron 215
   cierres más, **todos a Post Venta** (la regla mantenimiento→Ariana murió
   con la decisión de Carlos del 28-08). La copia mala de Hever que sigue
   pegada dentro de esa carpeta la filtra la deduplicación por contenido de
   `scripts/lib/cierres-postventa.mjs`. Total importado: 605 informes,
   US$ 336 mil + S/ 190 mil, parque instalado en 314 máquinas.
9. **El archivo histórico del servidor** (`\\192.168.10.210`, 2 935 GB de PDF,
   fotos de instalación y videos) dentro del CRM. Planteado por gerencia el
   29-08; el plan completo, con lo que se encontró mirando el servidor y las
   tres piezas de la solución, está en **`docs/21`**. No se construyó nada
   todavía: falta el piloto sobre `W:\FOTOS\PRIVADO` y tres datos que solo
   puede dar la empresa (subida de internet de la oficina, si el servidor está
   siempre encendido, y si un comercial puede ver las fotos de clientes de
   otro).
10. **Siete equipos de la ruta de Ariana siguen sin código** para Lesly, y las
    tres preguntas de pipeline para Carlos siguen sin respuesta (vienen del
    plan 11).
11. **Del 01-09 — hay que PEDIR** (sin esto no se construye la garantía por
    serie ni cotizar repuestos): las **guías de remisión** (número, fecha de
    salida, RUC, series; últimos ~30 meses — la garantía corre DESDE LA GUÍA,
    dictó Carlos) y las **fichas y precios de repuestos/mantenimiento de
    Lesly**. Decisiones pendientes de Carlos: si el plazo de garantía del
    documento de venta manda sobre los 24 meses estándar, la ventana de
    validez de una aprobación de precio, y el bloqueo duro de documentos al
    emitir el cierre. Trabajo en cola (docs/27): derivar llamada a logística
    con informe de vuelta, confirmación de Finanzas en el pedido, alerta a
    almacén «probar equipo», consulta de stock desde el caso de repuesto,
    ciclos al cerrar y la alerta del preventivo a los 3 meses. El banco de
    pruebas tiene sembrado material de demo del 01-09 (2 máquinas PRB-*,
    atenciones de prueba, 3 pedidos); la clave de `postventa2@` se rotó ese
    día y la tiene Santos.
12. **Hay cuatro cuentas con rol `gerencia`** y las aprobaciones de precio se
    están firmando con la genérica de la semilla: los tres visto bueno del
    29-08 (`Presu_514`, `516`, `517`) y los dos rechazos del 28-08 quedaron a
    nombre de **`gerencia@efameinsa-crm.local`**, no de kycabrejos ni de
    crcabrejos, que son las cuentas de gerencia de verdad. El registro de quién
    autorizó un descuento debería decir una persona. Preguntar a gerencia si se
    retira esa cuenta (y la de `soypuromarketing@gmail.com`, que es Santos).

---

## 7. Trampas conocidas (leer antes de tocar)

Cada una costó un rato de depuración y ninguna da error a la vista:

- **`if not funcion_booleana()` NO entra cuando la función devuelve `null`.**
  `es_backoffice()` era `rol_actual() in ('gerencia','admin')`, y `null in (…)`
  es `null`. Resultado: el control `if not es_backoffice() then raise` **dejaba
  pasar a quien no tiene perfil** — se comprobó contra producción que una
  llamada SIN NINGUNA SESIÓN atravesaba el control de gerencia de
  `resolver_aprobacion_cotizacion`. Eran **catorce funciones** con el mismo
  patrón. Arreglado en la `0127` con `coalesce(…, false)`. Regla: toda función
  de permiso devuelve sí o no, nunca «no se sabe».
- **Un `raise exception` de permiso tiene que decir CON QUÉ CUENTA se está
  entrando.** La pantalla se protege por rol **al abrirla, una sola vez**; el
  clic viaja después con la cookie que el navegador tenga en ese momento, y la
  cookie es una sola para todas las pestañas. El 29-08 gerencia reportó que el
  ingeniero no podía rechazar un precio bajo lista: se verificó de punta a punta
  que **sí puede** (rechazo real sobre su propia cotización, dentro de una
  transacción deshecha), así que el aviso solo pudo salir de una sesión que en
  ese instante no era de gerencia. Ahora el mensaje nombra la cuenta.
- **`truncate` (`white-space: nowrap`) infla el ancho MÍNIMO de la página.** La
  columna de contenido del layout es un flex sin `min-w-0`, así que una línea
  que no corta estira la pantalla entera —1 772 px— y hasta angosta la barra
  lateral. Para recortar una línea usar **`line-clamp-1`**, que no toca el ancho
  mínimo. (`overflow-hidden` en un bloque NO lo arregla: la regla del tamaño
  mínimo automático es de los ítems flex, no de los bloques.)

- **RLS por fila.** Una política que llama a una función de rol sin envolverla en
  `(select …)` se ejecuta **una vez por fila**. Dos políticas así hacían que
  escribir un nombre en la captura de Central tardara 8,8 segundos (0109).
- **Filtrar una columna que no existe en esa tabla** no falla fila por fila:
  PostgREST devuelve la consulta ENTERA vacía. Un `.eq("es_soporte", false)`
  sobre `leads` dejó a Central sin su historial, sin ningún error.
- **`sm:max-w-*` gana a `max-w-*`** en el diálogo base: pedir `max-w-3xl` sin el
  prefijo `sm:` deja el modal en 24 rem.
- **La ficha impresa sale de `ficha.bloques`**, no de los cuatro cajones viejos
  (`caracteristicas`, `dimensiones`…). Los 121 activos usan `bloques`.
- **`tier` es un enum** (`tier_precio`): comparar contra texto falla.
- **Un precio por producto, tier y DÍA** (`uq_precio_vigente`): dos correcciones
  el mismo día se pisan, no se apilan.
- **Varios productos comparten modelo** (cada color de coche es un producto):
  nunca buscar un producto por `modelo` para actuar sobre él, siempre por `id`.
- **Las fotos viven en dos sitios**: las 296 originales en `public/productos/` y
  las subidas en el bucket `productos` con prefijo `storage:`. Usar `rutaFoto()`.
- **Vercel construye siempre el commit más nuevo**: si ese no compila, se cae
  todo lo que hay detrás. Un archivo sin commitear tuvo la producción congelada
  45 minutos con ocho commits en cola.
- **Una FK nueva entre tablas que ya se embeben rompe TODOS los embeds sin
  nombre.** La 0141 agregó `leads.oportunidad_id` y con eso hubo DOS relaciones
  entre `leads` y `oportunidades`: los tres `select` que pedían `leads(...)`
  desde oportunidades quedaron ambiguos para PostgREST, la consulta ENTERA
  falló (sin error a la vista: la pantalla lo lee como «registro inexistente»)
  y la ficha de la oportunidad y el cotizador estuvieron caídos una hora el
  01-09. Antes de migrar una FK, grep de los embeds entre las dos tablas y
  nombrarlos: `leads!oportunidades_lead_id_fkey(...)`.
- **Una cuenta de práctica que EMITE consume número real** (hasta la 0145).
  Cotizaciones, informes de cierre e informes de servicio pedían número al
  mismo contador fueran de quien fueran; la limpieza de práctica después
  borraba el documento y el correlativo quedaba como hueco (2202-2208 del
  28-08, informes 002-003). Desde la 0145 la rama de práctica se decide
  ANTES de pedir número (`cotizacion_es_de_practica`, `es_prueba` de la
  fila, `es_cuenta_prueba()`). Si se agrega otro documento numerado, hay que
  darle su rama de práctica también. Y **un script que borre documentos de
  práctica emitidos debe decir qué correlativos se lleva**.
- **Las horas que imprime `node-pg` engañan.** Un `timestamptz::timestamp` o
  un `at time zone 'America/Lima'` llega a Node como hora sin zona, Node lo
  toma como hora local de la máquina y `console.table` lo muestra como ISO
  con `Z`: sale corrido cinco horas (el 2209 «enviado a las 20:45» era de las
  15:45). Para leer horas en un diagnóstico, siempre `to_char(x at time zone
  'America/Lima', 'DD-MM HH24:MI')`, que viaja como texto.

---

## 8. Entorno

- Windows 11, Node portable v24 en AppData. Sin Python, sin poppler, sin `gh`.
- Repo: `https://github.com/Efameinsa/crm-efameinsa`, rama `main`.
- **Vercel**: el proyecto vive en la cuenta **corporacionefameinsa.sa@gmail.com**,
  no en la personal de Darwin. Los despliegues se miran desde ahí.
- Servidor local: `npm run dev` en el puerto 3100 — **apunta a la base de
  producción**, así que lo que se pruebe ahí es real.
- `.env.local` tiene `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.

---

## 9. Rutina diaria que no se puede olvidar

**El informe para gerencia se arma TODOS los días**, 30 minutos antes de la
salida: jueves 16:30, lunes 18:30, sábado 11:30, el resto 17:30. Se genera con
`scripts/informe-diario.mjs`. Lo firma Santos.
