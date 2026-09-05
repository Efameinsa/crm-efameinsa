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

### Lo del 02-09 por la tarde: la reunión con Carlos (grabaciones 11:17 y 11:47)

Santos: «inicia lo que puedas iniciar». Los cuatro ajustes chicos, hechos y
verificados con `scripts/_verificar-ajustes-carlos.mjs`:

1. **RUC o DNI antes de cotizar** («lo único flexible es cuál de los dos»):
   `enviarCotizacion` no emite si la cuenta es SIN_DOC; el cotizador lo avisa
   en ámbar arriba desde que se abre. El borrador se puede armar igual.
2. **Rubro a la vista, «Cambiar rubro» sin código** (`cambiar-rubro.tsx`,
   `cambiarRubroCuenta`): en la cabecera de la oportunidad —donde Carlos lo
   buscó y no lo encontró— y en la ficha del cliente. «Otro» sale como
   «(revisar)» y sin rubro en ámbar.
3. **N.º de pedido del ERP obligatorio** al marcar «pedido ejecutado»
   (`checks-pedido-central.tsx` + `liberarPedido`).
4. **La confirmación de Finanzas acepta una captura** (0157,
   `pago_confirmado_captura`): el cuadro tiene campo de archivo, sube al
   bucket `adjuntos` bajo `finanzas/<pedido>/`, quién/por dónde quedan
   opcionales si hay captura; la ficha del pedido enlaza la captura (URL
   firmada).

**Hechos después, en local y SIN desplegar (Santos: «no despliegues»)**:
- **Control de pedidos «Por paso»** (`tabla-por-paso.tsx`): fila = pedido,
  columna = paso, chips «Falta plano (4)» que filtran. El tablero de fases
  sigue por defecto.
- **«Mi parque» y «Mantenimiento por vender»** (`src/lib/parque.ts`,
  `/comercial/parque`, `acciones/parque.ts`). Decisión de Santos: el
  mantenimiento **lo venden ambos**, comercial y postventa, y **uno ve la
  gestión del otro**; no hay exclusividad por cartera. Por cliente con
  máquinas: parque, último mantenimiento (equipos fichados + servicios de
  postventa) con el semáforo de la Ruta, última gestión de quien sea, y si ya
  hay una oportunidad de mantenimiento abierta y de quién (no se duplica: se
  entra a esa). «Ofrecer mantenimiento» abre la oportunidad
  (`tipo_postventa=mantenimiento`, seguimiento, para hoy) → Mi día y Ruta.
  El comercial ve su cartera; quien ve todo postventa alterna «Toda la
  empresa» (`?todos=1`, enlace «Mantenimiento por vender» en el menú del
  área). Mi día trae una tanda de 10 (nunca/vencido y sin gestión abierta).
  El historial del cliente ahora incluye **los servicios y atenciones de
  postventa** (`EventoServicio` en `linea-tiempo-cuenta.tsx`). Verificado
  con `scripts/_verificar-parque.mjs` (Katerine: 50 clientes, 75 máquinas,
  40 por vender).
- El reporte `servicios-sin-cliente` distingue «Pedido 2 de 4 · mismo
  cliente» de «fila repetida en el Excel» (SALIDA= para no pisar el abierto).
- **«Mi parque» acotado** (Santos, 02-09 tarde: «solo prepárala para Ariana,
  quítale al resto; mantener a postventa»): lo abre la llave `hace_postventa`
  (la que reparte Lesly); a Ariana se le dio con
  `scripts/dar-llave-mantenimiento-ariana.mjs`. Sin llave: sin enlace, sin
  bloque en Mi día y `/comercial/parque` devuelve a Mi día.
- **Auditoría de cuentas desde gerencia** (0160, `/gerencia/auditoria`,
  `acciones/auditoria.ts`, `app/auditoria/entrar/route.ts`, `lib/auditoria.ts`):
  «Entrar como» genera un acceso de un solo uso (vence en 10 min) y lo abre
  en una ranura `ver1…ver5.crm.efameinsa.com` —una sesión por dirección, así
  gerencia no se pisa y puede auditar a varios a la vez—. En la ranura el
  proxy rechaza todo lo que no sea GET (**solo lectura**) y el layout pone la
  franja ámbar «Sesión de auditoría de gerencia · viendo como X · ranura
  verN». Todo queda en `auditorias_sesion`. **Los cinco subdominios ya
  están creados por el proveedor y verificados en Vercel (02-09 tarde)**.
  Verificado en local con `scripts/_verificar-auditoria.mjs` + curl con
  `Host: ver1.localhost:3005`. Pendiente de desplegar.
- **Los «tirones» al navegar** (Santos, 02-09). Medido en producción con
  sesión real: pantallas de 0,3 a 1,0 s con servidor caliente (Mi día 0,6 s,
  1,8 s en frío; Mi cartera 1,0 s); Supabase y Vercel están los dos en São
  Paulo, así que no es la base sino las idas y vueltas por clic (sesión
  validada dos veces por la red + perfil en el proxy + 4 a 11 consultas en
  secuencia) y que 37 de 46 pantallas NO tenían esqueleto de carga. Hecho:
  `src/app/(app)/loading.tsx` (esqueleto para todas), el proxy solo lee el
  perfil en «/» y «/login», `requerirPerfil` verifica el JWT localmente con
  `jose` (ES256, JWKS en memoria) y solo va a la red si no puede, y
  `experimental.staleTimes` 30 s para que volver atrás sea instantáneo.
  OJO: con el esqueleto, un `redirect()` de página llega dentro del
  contenido (200), no como 307: los scripts de verificación lo contemplan.
  Segunda tanda (misma tarde): **Mi cartera** contaba los rubros con una
  consulta por rubro (nueve viajes) → `cuentas_por_rubro` (0161, un viaje);
  **Mi día** y **la ficha de oportunidad** hacían sus consultas en fila →
  ahora en un `Promise.all` (la ficha pasó de 11 viajes en secuencia a 2
  tandas); **optimistic UI** en los pasos del pedido de postventa
  (`useOptimistic` sobre `servicio`: el check se pinta al toque y se
  revierte si falla), en los dos checks de Central, en «Aprobar» del control
  y en «Retomar». Nada de caché de datos. `notFound()`/`redirect()` también
  viajan dentro de la página con el esqueleto: los scripts lo contemplan.

**Quedan por construir de esa reunión**: el **cierre semanal del sábado
11:55** (consolida lo diario + dos campos obligatorios «¿qué necesitas para
mejorar tus ventas?» y «¿a qué te comprometes?» + bloque fijo de rechazados
con motivo + histórico); el **reporte «qué te faltó»** por comercial dentro
del cierre semanal (los % de campos vacíos medidos el 02-09); y el
**velocímetro de ventas del mes** de vuelta en Mi gestión. Siguen esperando
a otros: formato de solicitud a almacén y fichas/precios de repuestos y
mantenimiento (Lesly), guías de remisión, informe de logística.

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
  **Segunda pasada (10:10)**: Katerine seguía con «271 recién asignadas» y
  Santos preguntó quién las asignó. Nadie: 269 eran filas del Excel con
  estado en blanco a las que el importador puso etapa `asignada` y una nota
  «[Histórico …]» fechada el 21-08, y esa nota engañaba al saneador. 455 en
  total pasaron al histórico con
  `scripts/sanear-fosiles-con-nota-de-import.mjs` (respaldo y `--revertir`
  propios). «Recién asignadas» significa: derivada por Central y todavía sin
  primer contacto. Quedan 3 (C5), 5 (C4), 0 (C1).
  **Tercera consecuencia (10:20)**: Ariana «no puede ver» a BECERRA ROJAS
  SEBASTIAN. Sí estaba —ficha con RUC 10757514678 en su cartera, cotización
  2043-26 del 15-07 y una gestión con contenido del 22-08—, pero sus dos
  oportunidades venían del Excel sin gestión dentro del CRM y el archivado
  las mandó al histórico: desaparecen de «Mis oportunidades» y de Mi día.
  Santos lo encontró por Mi cartera y pidió «Retomar» ahí también:
  **0155** hace que `listar_clientes` devuelva `historica_id` (la archivada
  más reciente del cliente) y la fila de Mi cartera muestra el botón en la
  columna «Abiertas» cuando no tiene ninguna abierta. Verificado con
  `scripts/_verificar-retomar-cartera.mjs` (sesión real de C4).
  **Ojo con el prefijo «[Actualización 22-08 …]»**: es el día en que se
  releyó el Excel, no el de la gestión; la fecha real es `realizada_at`.
  Becerra tenía esa nota fechada 15-07 y su última gestión real fue el
  18-07: fósil legítimo. Medido bien, de lo archivado hoy tienen su última
  gestión del Excel en agosto (sin contar las notas refechadas al 21-08):
  C4 141, C5 122, C1 102; y gestionadas la semana del 18 al 22-08, que el
  segundo saneador barrió a propósito: C4 25, C1 15, C5 5.
  **Reposición (10:55, orden de Santos: «devuélvele a Ariana a Becerra y
  reponer todos los casos que hayas causado de manera similar»)**:
  `scripts/reponer-gestiones-semana-del-import.mjs --aplicar` devolvió **52**
  (C4 33, C1 15, C5 4) a la etapa que tenían antes del archivado, leída de
  los respaldos, con una nota fechada hoy firmada por admin@efameinsa.com.
  Criterio: última actividad real fechada del 18 al 22-08 con texto, menos
  los artefactos («[Histórico]» fechada 21-08, texto que empieza con fecha
  de otro año como HOSTAL MARVIN), más Becerra a pedido. Respaldo en
  `backups/repuestas-semana-del-import-02-09.json`, `--revertir` propio.
  El segundo saneador quedó corregido con esa misma regla (ensayo: 0
  candidatas). Dos de las repuestas de C4 estaban en `asignada` en el Excel
  y suman a sus «recién asignadas». Becerra tiene además la ficha partida
  (una sin RUC, «Falta RUC/DNI», sigue en histórico): pendiente unirla en la
  del RUC.
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

### Lo del 02-09 a las 15:30: las sedes de un mismo RUC (0158)

Central derivó a PV la solicitud PRO-09106 como «SEGURO SOCIAL DE SALUD
(ESSALUD) - RED ASISTENCIAL» y a PV le salió «… HOSPITAL DEL ALTIPLANO DE LA
REGION DE PUNO - ESSALUD» (capturas `centi1`/`centi2`). Causa: el RUC de
ESSALUD (20131257750) es uno solo para todo el país; la única ficha con ese
RUC era la de Puno (Excel de Katerine, 14-08) y el CRM une por RUC antes que
por nombre. Ya había pasado el 27-08 (Libeth Escalante) sin que nadie lo
viera. Gerencia (audio 15:34): «para los casos puntuales como ESSALUD, la
Marina de Guerra y el Ministerio de Salud, solo en esos casos, cuando se
reconozca por el RUC deben aparecer las opciones [de sede], y ahí se puede
derivar como negocios diferentes».

- **Modelo (0158, aplicada 15:50).** La institución es la madre
  (`cuentas.sedes_por_ruc = true`) y cada red u hospital es una hija por
  `cuenta_padre_id` (el grupo económico de la 0052) que **repite el RUC de
  la madre**. El índice único `uq_cuentas_doc` queda solo para fichas sin
  madre; para las hijas decide el trigger `trg_documento_unico`, que lanza
  el mismo 23505/`uq_cuentas_doc` que ya entienden las pantallas. Para
  cualquier otra empresa el RUC sigue siendo único; marcar una institución
  nueva es decisión de gerencia (un `update` a mano, no hay pantalla).
- **Al derivar.** El diálogo de Central (`asignar-lead-dialog.tsx`) pregunta
  «¿De qué sede es este contacto?» cuando el RUC es de una institución
  (`sedes_de_documento`): la institución en general, cada sede con su
  dueño, u «Otra sede (nueva)» con el nombre que escribió Central. La
  elección va a `elegir_sede_del_lead` → `leads.cuenta_id`, que
  `asignar_lead` respeta desde la 0143. Sin elección (API, otra pantalla),
  `asignar_lead` resuelve por el nombre con `sede_para_lead`: encuentra la
  sede (sin tildes, mayúsculas ni signos) o la crea, sin dueño.
  `cartera_en_juego` mira la sede, no la primera ficha del RUC.
- **Datos.** Madre «SEGURO SOCIAL DE SALUD - ESSALUD» creada; Puno pasó a
  ser su sede (sigue de Katerine, con su historial); la solicitud de hoy,
  su contacto (Eddy Ataurima) y su oportunidad se movieron a la sede
  «SEGURO SOCIAL DE SALUD (ESSALUD) - RED ASISTENCIAL» (el nombre que
  escribió Central; el correo `…AYA@essalud` sugiere Ayacucho: **preguntar
  a Central y renombrar**). La ficha con RUC de la Marina (Katerine) es la
  madre de la Marina; nació la madre del MINSA (RUC 20131373237) sin dueño.
- **Pendiente.** La solicitud del 27-08 (Libeth Escalante / Sr. Efraín,
  oportunidad `90d92ed8`) sigue bajo Puno: **preguntar a PV de qué red es**
  y moverla. Las cuatro fichas «MARINA DE GUERRA» sin RUC (Brenda ×3,
  Katerine ×1) no se tocaron: habría que saber qué unidad es cada una para
  colgarlas de la madre. El grupo económico en la ficha ahora dice «Sedes de
  la institución» cuando todas comparten el RUC.
- Verificado con `scripts/_verificar-sedes-ruc.mjs` (transacción como
  Central, se deshace entera): la red nueva no cae en Puno, la misma red
  escrita distinto no abre otra sede, la elección manual manda, una sede
  ajena se rechaza, un RUC común sigue bloqueado. **Desplegado 18:01** (push
  a8eb471, con la 0159 y lo de otras sesiones: 0160–0162); verificado en producción con sesiones reales y el selector de sede hallado en el JS publicado (`_esperar-selector-sede-prod.mjs`).
- **Revisión de cómo se envió (Santos, 16:10).** Con sesiones reales contra
  `next dev -p 3100` (`scripts/_verificar-vista-sede-essalud.mjs`, acepta
  `BASE_URL`): PV abre la oportunidad y ve la sede con el nombre de Central,
  el RUC y el contacto, sin nada de Puno; Central ve lo mismo en su
  derivado. Se corrigió: (a) el aviso «Nuevo contacto asignado» que le llegó
  a PV a las 15:03 decía el Hospital del Altiplano → actualizado; (b) la
  cabecera de la oportunidad ahora dice «Sede de SEGURO SOCIAL DE SALUD -
  ESSALUD · el RUC es el de toda la institución»; (c) **0159**: Katerine no
  veía en su ficha de Puno que ahora es una sede, porque `grupo_economico`
  corría con su RLS y la madre sin dueño no existía para ella — la función
  quedó en dos partes (comprobación con RLS + listado `security definer`), y
  de paso arregla lo mismo para cualquier grupo económico repartido en
  varias carteras desde la 0052. Sedes nuevas (Lambayeque, la que venga):
  Central las crea desde el mismo diálogo con «Otra sede (nueva)», o solas
  al derivar sin elegir.

---

### Lo del 02-09 a las 17:30: el cierre de repuestos y servicios de Ariana (sin migración)

Ariana (C4, con el permiso de mantenimiento desde hoy) cerró con **FANCAVEL
SERVICIOS GENERALES E.I.R.L.** (Chimbote) una cotización en papel —la
2191-26 de OPEN, hecha en Word, NO está en el CRM— de **trece repuestos y un
servicio de mantenimiento correctivo** (USD 2.011,07 con IGV). Dos cosas la
frenaron en el informe de cierre:

1. **El nombre.** La ficha (cartera de Katerine, RUC 20569100349) se llama
   «INVERSIONES VILLA SAN MARIA DE LAS NIEVES S.A.C. -FAMCAVEL SERVICIOS
   GENERALES E.I.R.L.»: dos razones sociales pegadas desde el Excel y con
   «FAMCAVEL» mal escrito. El cliente quiere que el documento salga solo a su
   nombre. «Corregir» mandaba a la sección plegada del final y Ariana no dio
   con la caja. Ahora **«Se le factura a» tiene su botón Editar en el mismo
   cuadro**: razón social, RUC y comprobante ahí mismo, con «Volver a lo que
   dice la ficha». El aviso de identidad, cuando el RUC es el mismo, dice que
   puede estar bien si el cliente lo pidió; con otro RUC sigue avisando
   igual. Es solo este documento: la ficha no se toca desde ahí.
2. **Los renglones.** Todo era «equipo»: el botón, el ejemplo, la validación
   y el rótulo EQUIPOS de la tabla del PDF. Ahora cada renglón lleva
   `items[].tipo` (equipo / repuesto / servicio; sin él es equipo, como todo
   lo emitido antes), hay tres botones de agregar, el ejemplo cambia con el
   tipo, y el PDF rotula la columna según lo que haya («REPUESTOS Y
   SERVICIOS», «EQUIPOS, REPUESTOS Y SERVICIOS»; `rotuloDeItems` en
   `lib/informes.ts`). Para listas largas, **«Pegar una lista»**: una línea
   por renglón, `descripción | cantidad | precio` o con tabulador desde
   Excel. La vista del cierre emitido (`vista-cierre`) edita el tipo con el
   mismo código de corrección de la 0153/0154.

**Pendiente de decidir (Santos/Central):** la ficha 20569100349 debería
llamarse solo «FANCAVEL SERVICIOS GENERALES E.I.R.L.» si ese RUC es de la
E.I.R.L. (no se pudo verificar en SUNAT desde acá); INVERSIONES VILLA SAN
MARIA tiene su propia ficha con el RUC 20604034702. Hay además una tercera
ficha con el mismo nombre pegado y sin RUC, candidata a fusión.

### Lo del 03-09 (mañana): los comerciales agregan rubros (0163)

Santos, con la foto del desplegable de rubro de la ficha: «los comerciales
deben de poder agregar rubros». La lista tenía ocho palabras y escribirla era
de operaciones/gerencia (0118); cuando el cliente no cabía, iba a «Otro»
(1.550 clientes, el rubro que menos dice).

- **Dónde:** el mismo «Cambiar rubro» / «Agregar rubro» de la ficha y de la
  cabecera de la oportunidad (`cambiar-rubro.tsx`). El desplegable termina en
  **«＋ Agregar un rubro nuevo…»**: aparece una casilla, se escribe y con
  **«Agregar y poner»** queda en la lista para todos y puesto en ese cliente,
  en un solo paso. Mientras escribe, si ya hay uno parecido («miner» →
  «Minería / Campamento») se ofrece **«usar «…»»** antes de fabricar otro.
- **La base (0163):** `agregar_rubro(p_nombre)`, security definer para
  cualquier usuario activo. Busca antes de agregar con `rubro_clave()` (sin
  tildes ni mayúsculas) y un índice único sobre esa clave frena repetidos
  también desde la pantalla de catálogos. Si existía retirado, lo reactiva y
  avisa. Guarda `creado_por`/`creado_at`; `uso_de_listas()` los devuelve y
  **Admin → Catálogos** muestra «· lo agregó C4» al lado del rubro, para que
  Lesly unifique o renombre. Renombrar y retirar siguen siendo de operaciones:
  la RLS de la tabla no cambió.
- **Acción:** `agregarRubroYAsignar` en `acciones/cuentas.ts` (llama a la
  función y luego a `cambiarRubroCuenta`). Verificado con
  `scripts/_verificar-agregar-rubro.mjs` (sesión de práctica, todo verde,
  limpia lo suyo). **Desplegado el 03-09 a las 09:21** (8592383, READY en
  Vercel), por pedido de Santos fuera de ventana; la migración ya estaba.

### Lo del 03-09 (09:30): cliente antiguo/nuevo y la dirección, a la vista en el cierre (sin migración)

Santos, con la captura `brenda-error.jpeg`: al armar el cierre de ECOLAV
SORELA (RUC 20602909701) el documento salía como «cliente nuevo» y Brenda no
encontraba dónde cambiarlo ni dónde escribir la dirección. Las dos cosas SÍ
eran editables, pero solo dentro de «Ver y editar lo prellenado», la sección
plegada del final: el mismo problema que tuvo Ariana con la razón social el
02-09. Y ECOLAV no tiene ninguna venta en el CRM (ni del Excel importado) ni
dirección en la ficha, así que el CRM no podía saber que ya nos compró.

- **`formulario-informe.tsx`:** el bloque «Se le factura a» muestra debajo
  del RUC «Cliente nuevo/antiguo · dirección» (en ámbar «sin dirección» cuando
  falta) y al pulsar «Editar» aparecen las pastillas Antiguo/Nuevo y la caja
  «Dirección», con la pista «la que va en el documento; puede ser otra sede».
  La dirección del documento no toca la ficha del cliente: un cliente puede
  tener varias. «Dirección final del despacho» pasó a la sección de Entrega,
  debajo de «Lugar de entrega». Los tres se quitaron de la sección plegada
  para no tenerlos dos veces.
- **`prellenarInforme`:** «nuevo» se propone solo si no hay ventas NI equipos
  instalados NI servicios de postventa de esa cuenta (antes solo miraba
  `ventas`). El comercial sigue teniendo la última palabra.
- El borrador que Brenda guardó a las 09:08 (sin correlativo, `cliente_nuevo`
  true, sin dirección) no gastó número; al volver a entrar arma uno nuevo.
- **Desplegado el 03-09 a las 09:33** (0c7aaa3, READY en Vercel) por pedido de Santos; verificado entrando como Brenda a la pantalla del cierre de ECOLAV en producción (`scripts/_verificar-cierre-direccion-prod.mjs`): el HTML ya trae «Cliente nuevo · sin dirección» y «Dirección final del despacho» a la vista.

### Lo del 03-09 (10:00): los borradores se editan sin código (sin migración)

Santos: «los cierres que están en borradores deberían tener la opción para
editarse, no tiene sentido que se guarden en borrador si no se pueden editar,
lo mismo con las cotizaciones: agregar esa opción para editar sin necesidad
de pedir PIN, el PIN se pide solo cuando ya hay una numeración». Tenía razón
en lo de los cierres: el borrador se guardaba (solo al mirar el PDF) y NO
había ninguna pantalla que lo volviera a abrir —la vista del cierre decía
«se termina desde el formulario» y el formulario arrancaba en blanco, armando
otro borrador (es lo que le pasó a Brenda el 03-09 a las 09:08)—. Las
cotizaciones en borrador sí se editaban desde la oportunidad («Continuar y
confirmar»), pero no aparecían en «Mis cotizaciones» y el botón no se leía
como editar.

- **Ruta nueva `/comercial/cierres/[id]/editar`:** el mismo `FormularioInforme`
  de `/informes/nuevo`, arrancando con el borrador (`cargarBorradorInforme`
  en `acciones/informes.ts` + prop `borrador`). Reconstruye lo que el
  formulario guarda transformado: la pastilla de modalidad frente al texto
  libre, la fecha «DD/MM/AAAA» de vuelta a ISO para el calendario, quién
  recibe frente a «otra persona», el presupuesto enganchado por
  `cotizacion_id` o por `presupuesto_ref`, los adjuntos ya subidos. Si el
  informe ya se emitió o anuló, redirige a la pantalla del cierre; Central
  también (mira, no edita: lo edita el comercial de la cartera o backoffice,
  igual que la política `informes_edita`).
- **Botón «Guardar borrador»** en el formulario (antes solo se guardaba al
  abrir «Ver borrador PDF»); en un formulario nuevo, guardar lleva a su ruta
  de edición. Emitir desde la edición lleva a la pantalla del cierre.
- **`VistaCierre`:** un borrador muestra «Editar» en granate (prop
  `editarBorradorHref`) y el texto dice «se edita sin código; el código se
  pide recién cuando el informe tiene número». **«Mis cierres»:** la fila de
  un borrador abre directo el formulario, con un lápiz al lado del PDF.
- **«Mis cotizaciones»:** ahora trae arriba los borradores del CRM (sección
  «Borradores sin número · se editan sin código»), la fila abre el cotizador
  y lo numerado del CRM ofrece «Corregir», que sí pide el código (0123). La
  fila pasó de `<a>` a `div` con enlace estirado para poder llevar el botón.
  En la oportunidad, «Continuar y confirmar» pasó a decir **«Editar y
  confirmar»**.
- **Verificación** con `scripts/_verificar-borradores-editables.mjs`
  (sesiones reales; crea un borrador de cierre en la cuenta de práctica de
  postventa, marcado `es_prueba` al insertar porque la marca no se cambia
  después, y lo borra): 22 comprobaciones en verde en local, incluida la de
  Central sin «Editar» y la de Katerine con su borrador de Tulumayo en «Mis
  cotizaciones» y en el cotizador sin código. `tsc`, `eslint` y los 342 tests
  en verde.
- **Desplegado el 03-09 a las 10:33** (empujado junto con e13ee7c por pedido de Santos, fuera de la ventana de la 1 pm).

### Lo del 03-09 (10:30): la captura de Finanzas se arrastra o se pega (sin migración)

Postventa, vía Santos: en «Finanzas confirmó el pago» «falta la opción para
subir foto como lo haces en otros formularios para arrastrar o pegar la
imagen ahí». El diálogo genérico `Cuadro` de la ficha del pedido
(`pedido-postventa.tsx`) usaba un `<input type="file">` nativo —el
«Ningún archivo seleccionado»— que no acepta ni arrastrar ni Ctrl+V, mientras
que Central y «Pasar contacto» ya tenían la zona de `CampoAdjuntos`.

- **`CampoArchivo`** (en el mismo archivo): la misma caja punteada de
  `CampoAdjuntos` pero para **un** archivo: clic para elegir, arrastrar, o
  Ctrl+V en cualquier parte del diálogo (`onPaste` en `DialogContent`; el
  cursor está en «quién» o en la nota, no en la caja). Muestra miniatura si es
  imagen, nombre y peso, y una X para quitarlo. La captura pegada llega como
  `image.png` y se renombra `captura-pegada.png`. Valida al elegir (fotos o
  PDF, hasta 10 MB) en vez de al enviar. Vale para todos los campos
  `archivo: true` del Cuadro, no solo el de Finanzas.
- La subida y la acción `confirmarPagoFinanzas` no cambian (0157).
- `tsc`, `eslint` y `next build` en verde. **No pude probarlo en el
  navegador**: no hay Playwright en el proyecto y la clave de `postventa2@`
  la tiene Santos; probarlo pegando una captura antes de desplegar.
- **Desplegado el 03-09 a las 10:33** (e13ee7c, READY en Vercel) por pedido de Santos («despliegalo»), fuera de la ventana de la 1 pm. Falta que postventa pegue una captura real y avise.

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

**Para retomar el 03-09 a primera hora (Santos):** los correlativos de los
cierres, reunión con Lesly y postventa del 02-09. Todo está en
`docs/historial/19-correlativos-cierres-02-09.md`. Ya hecho: el contador OPEN
volvió a 5 (los próximos cierres rellenan 006-009) y el 003 de Grupo
Alimenticio quedó anulado. Falta decidir con gerencia si los cierres de
postventa de Hever entran al CRM (una sola serie anual) o siguen en Word con
una serie que no choque; su cierre de Velásquez Sánchez está esperando número.
El script y el doc no están commiteados.

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

**03-09, 14:40 — decisiones de Carlos aplicadas** (memoria `crm-reunion-03-09-correlativos-decisiones`, mapa en el artefacto «Mapa de correlativos»): contador de cierres OPEN en 12 (los huecos 007-009 NO se rellenan, se anulan), contador EFAMEINSA en 2211 (2186-2190 y 2202-2208 tampoco), cierres OPEN 030-039 reservados a postventa en `correlativos_reservas` (sin vencimiento), borrados los dos borradores «X verif» de práctica, y cargados a `cotizaciones_historicas` los 23 Word previos al CRM (OPEN 448-461 con el 454 doble, EFAMEINSA 2177-2182, 2186, 2187) con `scripts/cargar-word-previos-al-crm.mjs`. Pendiente para el despliegue de las 18:00: buscador por cliente y filtro Open/Efameinsa en Central, «anulados» visibles en el reporte de correlativos, ruta del contacto de vuelta en la oportunidad, «Mis cierres» en postventa, lo de Brenda («no puedo editar ni borrador»). En dos días: texto libre en el cotizador y subida de los cierres de postventa 30-32.

**03-09, 14:46 — desplegado 5943d1b (fuera de ventana, por orden de Santos):** migración 0164 aplicada (`correlativos_anulados`, contadores la saltan; anulados cierres OPEN 007-009 y cotizaciones EFAMEINSA 2186-2190 y 2202-2208), Central busca presupuestos por cliente o número en todo el año y filtra OPEN/EFAMEINSA (`/central/presupuestos?q=…&serie=…`), los anulados se ven al pie de presupuestos y en la pestaña «Anulados» de cierres, la ruta del contacto se muestra siempre en la oportunidad (hito «Entró con el histórico» cuando no hubo lead), y «Mis cierres» en el menú de postventa. Lo de Brenda («no puedo editar ni borrador») ya lo había resuelto la otra sesión a las 10:33 (507f8ee).

**03-09, tarde — sesión «CRM SERVIDOR» (archivo de la empresa en el CRM, decisión de Santos):** la PC de Santos hace de NAS casero con un **SSD interno de 2 TB** (BitLocker, sin suspensión, horas activas para Windows Update, UPS, usuario de Windows aparte para los servicios). Lo que el CRM necesita del servidor son **636 GB, no 3 TB** (medido con robocopy /L: fotos por cliente 602 GB / 162 392 archivos; informes de servicio 26,5 GB; presupuestos 2026 4,4 GB; Marketing 1,7 GB; fichas técnicas 0,9 GB; cierres 22 MB). Internet de la oficina: 14 Mbps de subida, 61 de bajada; la PC va por Ethernet a 100 Mbps. **El servidor EMPUJA** copias nocturnas con robocopy sin /MIR (solo agrega) a una carpeta `entrada` de la PC, y después se le retiran a Santos todos los accesos al servidor (hoy tiene T–Z montadas: los scripts que leen V:, T:, R:, S: pasan a leer del disco local). En la PC corren `scripts/servidor-archivos.mjs` y `cloudflared`; desde fuera se ve por túnel con enlace firmado. **Sin IP pública fija**: solo reserva DHCP interna (opcional). El túnel exige los DNS de efameinsa.com en Cloudflare (hoy en im-global) o un dominio aparte. Instrucciones para el ingeniero de Sistemas: artefacto https://claude.ai/code/artifact/fe5a70c4-abb2-4550-a7f0-d925908d3338 y PDF en Downloads («Archivo de la empresa en el CRM - instrucciones para Sistemas.pdf»). Recomendado aparte para gerencia: copia inmutable de los 3 TB en Backblaze B2 (~US$ 18/mes). **Plan 26 sigue sin aprobar**; alternativa más simple propuesta: bloques de 5 números por usuario reservados desde el navegador con las RPC de la 0138, sin coordinador local (los vencidos se anulan, como decidió Carlos). Mismo día: diagnóstico de la web nueva de Carpathia (web.efameinsa.com) vs la actual, artefacto https://claude.ai/code/artifact/00f09e44-e283-4150-aed5-d5b015d758b5; copias con sesión en Downloads\efameinsab\vista.

**04-09, 09:10 — postventa veía «Sin informe de cierre» en todos los pedidos (Ariana con la cuenta Post Venta, en Control de pedidos):** los siete pedidos en curso sí tienen cierre (002, 004, 005, 006, 010, 011, 012); la política de lectura de `informes_cierre` (0049) no incluía al área de postventa y la consulta del expediente venía vacía (también la apertura de despacho perdía dirección y contacto). **Migración 0165 aplicada a las 09:05** (política `informes_lectura_postventa`: `es_postventa()` lee los informes de su misma serie real/práctica): la pantalla ya muestra «Cierre Nº». En el código, pendiente para la ventana de las 13:00: las cifras se tapan a postventa donde antes las tapaba la RLS (`ListaInformesCierre sinPrecios`, sin botón «Cierre en PDF» en el pedido, `/api/informes/[id]/pdf` responde 403 y `/comercial/cierres/[id]` no existe para postventa salvo cierre propio).

**04-09, 10:40 — reunión de Santos, Carlos y Ariana (grabaciones 09:20, 09:47 y 10:10):** rangos definitivos de postventa, que reemplazan los «650/2300 pendientes» del 03-09. **Migración 0166 aplicada 10:41**: reservas OPEN 600-649 y EFAMEINSA 2250-2299 para las cotizaciones que postventa numera a mano en el servidor, INFORME-OPEN 30-40 para sus cierres (Carlos corrigió el 34 a **30**), y OPEN 599 apartado para reemitir uno de los dos Presu_454-26 del 21-08 («en uno de los números antes del 600 tendríamos que calzarlo»); falta que gerencia diga cuál de los dos clientes se renumera. Ensayado y revertido: un comercial en 598 recibe 650, Efameinsa en 2249 recibe 2300, cierre en 29 recibe 41. **Migración 0167 aplicada 10:52**: Central lee `cotizaciones_historicas` (buscaban el Presu_431-26 de Flores Rioja en Central y no salía porque la serie Open del CRM arranca en la 447 del 25-08). En el código, para la ventana de las 13:00: la pantalla de presupuestos mezcla el archivo del Word con lo emitido por el CRM y lo marca «Del archivo (Word)»; gerencia tiene «Presupuestos» y «Cierres de venta» en su menú; «Lo que derivé» muestra al pie los contactos descartados y duplicados del período (Carlos: «los rechazados están en un limbo»); y el expediente del pedido vuelve a ocultar los adjuntos a postventa hasta que Carlos decida si los ve. Pendiente de Ariana: renumerar en el servidor sus cotizaciones de postventa desde el 600, y el cierre 016 de Hotel Curasi (USD 872) que no llegó al CRM.

**04-09, 11:40 — cuarta reunión (grabación 10:48), con Central delante. Manda sobre lo anterior:** (1) **los avisos de pago se registran en el CRM, no en el ERP** («eso del ERP no es necesario, hacerlo simplemente en el CRM»); (2) **un mismo registro va a tres destinos a la vez** —Finanzas, postventa y el comercial dueño del cliente— «puede elegir una o las tres»; (3) **los rechazados se ven y se retoman** desde Central («que te permita verlo y retomarlo; una zona donde estén todos los acumulados»). **Migración 0168 aplicada 11:25**: `derivar_aviso(lead, finanzas, postventa, comercial, detalle)` anota el aviso como actividad tipo `nota` en la oportunidad viva del cliente (no infla indicadores), lo agrega a las observaciones del pedido de postventa en curso y deriva a Finanzas con el WhatsApp de siempre; informa en palabras qué quedó hecho y qué no se pudo (sin ficha, sin oportunidad, sin pedido). `retomar_lead(lead)` devuelve a la bandeja un contacto descartado, duplicado o derivado (area_destino vuelve a `comercial`, que la columna no admite nulo). Las dos se ensayaron en transacción y se revirtieron: el caso Sierra Travel dio los tres destinos correctos. En el código: la bandeja de Central cambia «A Finanzas» por «Avisar a…» con las tres casillas (`derivar-aviso-boton.tsx`, `lib/acciones/avisos.ts`), los rechazados de «Lo que derivé» traen botón «Retomar», y se retiran `derivar-finanzas-boton.tsx` y `lib/acciones/finanzas.ts`, que quedaron sin uso. Carlos también recordó al equipo que Santos no ve precios ni temas técnicos: eso va a Lesly por correo.

**04-09, 13:30 — cotizar en soles (pedido de Santos).** **Migración 0169 aplicada 13:05**: `cotizaciones.moneda_impresa` y `tipo_cambio`, con restricción de coherencia, y `crear_cotizacion`/`editar_cotizacion` parcheadas sobre la definición viva (nunca copiadas) para recibir `p_moneda_impresa` y `p_tipo_cambio`; en `editar`, nulo significa «no la cambies», para que el autoguardado no la pise. **Decisión de diseño:** los importes se siguen guardando en DÓLARES —ahí viven el maestro de precios, el piso, la aprobación de gerencia, las metas y todos los tableros— y lo que cambia es la moneda del DOCUMENTO; la conversión la hace el PDF con el tipo de cambio congelado, igual que el precio congelado del ítem (0126). El cambio sale de `parametros.tc_usd_pen` (hoy 3.75) y lo fija gerencia, no el comercial. En el cotizador hay un selector «Moneda del documento» debajo de Serie y el resumen muestra el equivalente en soles; en Central, las entregadas en soles llevan la marca «en S/» junto al total en dólares. Probado y revertido: crea en soles con el cambio congelado y los ítems en dólares, rechaza soles sin tipo de cambio, volver a dólares limpia el cambio. Pendiente si Carlos lo pide: el informe de cierre en soles (hoy solo la cotización).

**04-09, 13:10 — el tipo de cambio queda en S/ 3.63** por orden de Santos, «así será siempre hasta próximo aviso». `parametros.tc_usd_pen` pasó de 3.75 a 3.6300 en producción; se actualizó también el valor de respaldo del código (el que se usaría solo si el parámetro faltara). Afecta a las cotizaciones que se impriman en soles (0169) y a las comparaciones de gasto publicitario.

**04-09, 13:35 — corrección de la 0169:** al elegir soles, la pantalla seguía en dólares y el PDF también. Dos causas: (1) el detector de cambios del autoguardado no incluía la moneda, así que elegir soles no ensuciaba el borrador y nunca se guardaba —el PDF leía `moneda_impresa` y encontraba USD—; (2) la pantalla solo mostraba un renglón con el equivalente. Ahora **toda la pantalla trabaja en la moneda elegida**: el precio unitario se escribe en soles (se guarda convertido a dólares), y el subtotal por ítem, la referencia de precio, el aviso de «este cliente compró a», el IGV y los totales salen en soles. En el resumen se ve «Equivale a US$ …», que es la cifra con la que gerencia aprueba. Lo guardado sigue siendo dólares.

**04-09, 15:20 — reunión de las 14:30. Dos órdenes, la primera revierte la 0163.** **Migración 0170 aplicada 14:58**: (1) **los comerciales ya no crean rubros** —«nos van a llenar de 30 rubros; uno le va a llamar peluquería, el otro spa»—: `agregar_rubro` exige operaciones o gerencia y el desplegable ya no ofrece «＋ Agregar un rubro nuevo…» a quien no puede; cambiar el rubro eligiendo de la lista sigue igual para todos. (2) **una venta se puede caer después de facturada**: el caso del cierre 011-2026 de Sierra Travel (US$ 2.600 facturados el 01-09, la gerenta del cliente encontró una cotización más barata, se renegoció a 2.300). Carlos: «anulamos el pedido y volvemos de cero; el comercial manda un clip, le llega al administrador, ingresa y anula; en la central sale anulado por Lesly, operaciones». Nueva tabla `anulaciones_solicitadas` y función `solicitar_anulacion_cierre`: el comercial pide desde la vista de su cierre con el motivo (mínimo 15 letras, sin duplicar pedidos), el aviso entra a las notificaciones de operaciones y gerencia, y los pendientes salen arriba de todo en la pantalla de cierres de Central. Anular lo sigue haciendo operaciones con su código (`anular_cierre`, que ya arrastra la venta), y al anular se cierra el pedido automáticamente. Probado y revertido con el 011 real: la comercial no puede crear rubros, Lesly sí; el pedido genera seis avisos y repetirlo no duplica. **Reparto de roles que dejó dicho Carlos:** Central es derivación y supervisión; Lesly, operaciones, es quien apaga incendios.

**04-09, 17:20 — reunión de la tarde con el equipo comercial. Cuatro cosas.** (1) **Revertir un aviso mal derivado.** El mismo día que se estrenó el aviso de tres destinos, Central lo mandó a los tres cuando era solo para Finanzas. Carlos: «tiene que revertirse como si nada hubiera pasado; si yo soy gestor, recibo, pero esto no es mío: que no me genere el cliente, que no me genere nada», y «por ahí tengo una sección de mi historial de operaciones y que ponga revertir, revertir, revertir». **Migración 0171 aplicada 17:05**: tabla `avisos_derivados` que guarda qué dejó escrito cada aviso (la actividad en el historial, la línea exacta del pedido de postventa y el estado anterior del contacto), y `revertir_aviso(aviso, pin, motivo)` que deshace los tres rastros. Quién puede: Central, pero con el código de operaciones o gerencia («no la central directamente; a alguien le tiene que dar la autorización, o al menos que pida autorización con el PIN»). En «Lo que derivé» hay ahora un bloque «Avisos que mandé a otras áreas» con el botón Revertir. Probado y revertido: el aviso escribe en los tres lados, sin código no revierte, y con el código de Lesly deshace todo y el contacto vuelve a pendiente de triaje. (2) **El WhatsApp que «se borraba al toque»**: Central usa WhatsApp Web en Chrome y la pestaña llegaba sin el texto. Ahora el enlace apunta a `web.whatsapp.com/send`, el mensaje se ve en el diálogo, hay botón «Copiar el mensaje» y un enlace alterno a la aplicación. (3) **Alertas por correo apagadas** por orden de Carlos («quítame ya todas las alertas que llegan a mi correo; todo lo canalizamos por el CRM»): `avisos-n8n.ts` no dispara nada salvo que se ponga `AVISOS_CORREO=si` en el entorno. (4) **Pendiente agendado: la solicitud del file físico.** Hoy el comercial pide por correo el archivador del cliente, Central lo busca y lo entrega con cargo firmado; al devolverlo se anota fecha y hora. Carlos quiere eso en el CRM, desde la ficha del cliente, con alerta a Central y el ida y vuelta registrado. No se construyó: quedó como «a ver si lo podemos agendar». También quedó dicho que las incidencias se reportan con captura o video.

**04-09, 17:40 — Lesly no podía anular: le faltaba la puerta, no el permiso.** Recibió la notificación del pedido de Katerine, tocó y «no aparecía nada». Causa: el botón para anular vive en `/central/cierres` y el layout de esa sección solo dejaba entrar a Central, gerencia y admin; su rol es `operaciones`, así que `requerirRol` la devolvía a su panel. Anular, corregir derivaciones y autorizar ya eran suyos desde la 0116 y la base la deja leer los informes (por `es_postventa`, 0165): lo único que faltaba era el acceso a la pantalla. Corregido: `operaciones` entra a `/central`, y además tiene «Cierres de venta» en su menú para no depender de la notificación. Sin migración; lo que ve dentro lo sigue decidiendo la RLS.

**04-09, 17:50 — la corrección anterior estaba a medias.** Abrí el layout de `/central` a operaciones pero la pantalla de cierres tenía SU PROPIO `requerirRol` con los tres roles de siempre, así que Lesly seguía rebotando y para ella «no pasaba nada» al tocar la notificación. Corregido en `central/cierres/page.tsx`. Lección para la próxima: en esta base hay pantallas que repiten el candado del layout; al abrir una sección hay que barrer `requerirRol(` dentro de toda la carpeta, no solo el layout.

**04-09, 18:00 — el error que le salió a Lesly al anular: «record v_heredero is not assigned yet».** Es un defecto de la 0162: declaró `v_heredero record` y solo lo llenaba cuando había un cierre heredero, pero preguntaba `v_heredero.id is not null` siempre. Un record sin asignar no es nulo, es nada, y preguntarle un campo levanta esa excepción. Nunca había salido porque las dos anulaciones del 02-09 (001 y 003 de Brenda) SÍ tenían heredero; la primera anulación sin duplicado fue esta. **Segunda trampa, que costó un intento más:** PL/pgSQL pasa las variables como parámetros de la consulta, así que evalúa `v_heredero.codigo` aunque el CASE que lo envuelve no tome esa rama; cambiar la condición no bastaba. **Migración 0172 aplicada 17:58**: dos variables sueltas, `v_hay_heredero` y `v_heredero_codigo`, llenadas cuando la consulta trae fila; fuera de esa rama nadie toca el registro. La migración es tolerante (cada reemplazo se aplica solo si su anclaje está) y comprueba el resultado antes de ejecutar. Ensayado en transacción con el 011 real y el código de Lesly: anula el cierre, cae la venta de 2.250 y cierra el pedido de postventa; revertido después.

**04-09, 18:20 — el aviso de tres destinos llegaba solo a Finanzas.** Central lo reportó con dos capturas: marcó los tres y a postventa y al comercial no les llegó nada. Los cuatro casos del día son iguales (Grupo Alimenticio San José, V y P Ice, Sierra Travel y Pacha Nan Samay). Causa: para anotar en el historial del comercial o en el pedido hay que saber de qué CLIENTE se trata, y la 0168 solo lo resolvía por la ficha ya enlazada o por el número de documento; los cuatro contactos entraron sin documento y sin ficha, aunque los cuatro clientes están en el CRM con cierres de esta misma semana. **Migración 0173 aplicada 18:15**: la ficha se busca en cuatro intentos —ficha enlazada, documento, teléfono normalizado y razón social sin puntos ni mayúsculas—; los dos últimos solo valen si devuelven UNA ficha, y si devuelven dos el aviso lo dice en vez de elegir (misma prudencia de la 0144). Al encontrarla, el contacto queda enlazado a esa ficha. Probado con los cuatro casos reales y revertido: Sierra Travel, V y P Ice y Pacha Nan Samay llegan ahora a los tres destinos; Grupo Alimenticio San José no, y el aviso explica por qué: **ese cliente tiene dos fichas con el mismo teléfono y el mismo nombre, hay que unirlas**.

**04-09, 18:10 — se reenviaron los cuatro avisos del día y se unieron las fichas de San José.** Los avisos de las 14:25-16:07 habían llegado solo a Finanzas (causa en la 0173) y dos de ellos eran instrucciones de despacho que postventa necesitaba hoy. `scripts/reenviar-avisos-04-09.mjs` (aplicado): primero fusiona las dos fichas de GRUPO ALIMENTICIO SAN JOSE S.A. —mismo nombre, mismo teléfono, mismo comercial C1, una con RUC 20602498833 y otra sin documento— en la del RUC, sin mover cartera; después reenvía los cuatro avisos DESDE GERENCIA (no simulando a Central: el aviso queda con su autor real y es revertible), con el texto original más una línea que explica por qué llega tarde. Resultado: los cuatro entraron al historial del cliente, tres al pedido de postventa, y Sierra Travel no porque su pedido se cerró al anularse el cierre 011 (correcto). Pendiente humano: **el pedido de Sierra Travel nace de nuevo cuando Katerine emita el cierre nuevo, y ahí hay que volver a pasarle a postventa la instrucción de despacho** (Espinoza Cargo, Huamanga, a nombre de Elvia Rojas, lunes 7 o martes 8).

**04-09, 18:35 — «Lo que derivé» era una página kilométrica.** Con el período de 30 días la lista trae más de ciento cincuenta contactos, cada uno una tarjeta alta, y los dos bloques del pie —los avisos con su botón Revertir y los rechazados— quedaban enterrados a varios miles de píxeles (Santos: «el scroll es hasta abajo, demora mucho y las dos secciones están prácticamente enterradas»). Tres cambios: (1) los dos bloques se **pliegan** y muestran el número en el título; (2) se **mueven arriba de la lista**, donde plegados ocupan dos renglones y están siempre a mano; (3) la lista principal pinta **quince tarjetas** y el resto se pide con «Ver 15 más» o «ver los N restantes», que viajan en la URL (`?mostrar=`), así que no hay estado en el cliente y la vista se puede compartir tal como se mira. La lista de rechazados, además, tiene su propio alto con desplazamiento.

**04-09, 18:45 — «Ver 15 más» se sentía congelado.** Cada clic vuelve a preguntarle al servidor porque los contadores de cada cajón se calculan sobre el período entero (`cargarDerivados` enriquece TODOS los contactos del rango, no solo los que se pintan), así que hay una espera real de uno o dos segundos y con un enlace normal no pasaba nada en pantalla. Dos cambios: (1) `VerMasBoton`, un botón con `useTransition` que se apaga y dice «Cargando…» desde el primer milisegundo —la espera es la misma, la diferencia es que se ve—; (2) **el período por defecto de «Lo que derivé» pasa de 30 días a la semana**, que es el trabajo del día a día de Central: baja de ~150 contactos a ~40 y aligera toda la pantalla, incluida la primera carga. Los demás períodos siguen a un clic en el filtro. Si gerencia prefiere volver a 30 días por defecto, es una línea.

**04-09, 18:50 — anotado como pendiente técnico**, no resuelto: «Lo que derivé» enriquece todos los contactos del período aunque pinte quince, porque los contadores de los cajones se calculan sobre el conjunto entero. El detalle, con la propuesta de separar contadores (consulta agregada) de tarjetas (paginación en la base), el tamaño y el riesgo, quedó en `docs/22-backlog-reunion-31-08.md`. Santos: «anótalo, lo vemos luego».

**04-09, 19:00 — se hizo más amable el «ver más», sin tocar el fondo.** La tanda pasó de 15 a 30 tarjetas (el costo del servidor no depende de cuántas se pinten, así que treinta cuesta lo mismo que quince y son la mitad de clics) y el tramo siguiente se pide por adelantado con `router.prefetch` apenas aparece el botón: cuando Central llega al final de la lista y hace clic, la respuesta suele estar ya en el navegador. El pendiente de fondo —separar contadores de tarjetas— sigue anotado en el plan 22 y sin hacer.

**04-09, 19:10 — la espera del «ver más» ahora se ve como avance, no como cuelgue.** Santos preguntó por la respuesta optimista. La de manual no cabe —los contactos que faltan no están en el navegador, no hay nada que adivinar—, pero sí la misma idea: **ocupar el sitio de inmediato**. Al tocar el botón aparecen al instante hasta seis tarjetas en gris, del alto que van a tener, y cuando llega la respuesta se cambian por las de verdad; la página crece en el mismo momento del clic. El componente `VerMas` reemplaza a `VerMasBoton` y ahora dibuja también la barra completa, porque los esqueletos tienen que ir ARRIBA de ella, en el flujo de la lista. Con eso y el prefetch, en la mayoría de los clics los grises ni alcanzan a verse.

---

## Dónde quedó todo el viernes 04-09 a las 19:15, y por dónde sigue el lunes

**Lo que quedó vivo en producción hoy.** Nueve migraciones (0165 a 0173) y
catorce despliegues. En orden: postventa lee el informe de su pedido; los
rangos de numeración de postventa (Open 600, Efameinsa 2250, cierres 30);
Central lee el archivo de presupuestos del Word; el aviso a tres áreas; los
rubros restringidos a operaciones; el pedido de anulación desde el comercial;
cotizar en soles a 3,63; el aviso revertible con código; el aviso que encuentra
al cliente por teléfono y por nombre; y la corrección de `anular_cierre`, que
reventaba al anular un cierre sin heredero.

**Lo primero del lunes, el caso Sierra Travel.** Está a medio camino y tiene
orden:

1. Katerine ya pidió la anulación del cierre 011-2026 (16:48 del viernes).
   **Lesly lo anula** con su código, desde el recuadro amarillo de Cierres de
   venta.
2. Katerine rehace la cotización con **USD 1.987,29 sin IGV**, que son los
   2.345 con IGV que acordó. **Va a quedar pendiente de aprobación de
   gerencia**, porque el mínimo de esa lavadora es 2.250. Carlos ya lo aprobó
   de palabra: falta que lo apruebe en su bandeja, o Katerine no puede enviarla.
3. Central libera el cierre nuevo y le pone el número de pedido del ERP
   completo.
4. **Y hay que volver a pasarle a postventa la instrucción de despacho**:
   Espinoza Cargo, Carlos Zavala 369, destino Huamanga, a nombre de Elvia Rojas
   Salas, para el lunes 7 o martes 8. El pedido nuevo nace vacío y esa
   instrucción se quedó en el pedido viejo, que se cerró al anular.

**Lo que espera de otras personas.** Ariana: numerar desde el 600 y el 2250,
cierres 30, 31 y 32, el cierre de Hotel Curasi de agosto (USD 872) que no llegó
al CRM, e instalar el CRM en el escritorio. Lesly: los rubros nuevos ahora los
crea ella, unir las dos fichas de Hotel Curasi, decidir qué pasa con la cuenta
Post Venta de Hever, y las medidas de los coches que espera Ariana. Central:
corregir los siete contactos con fecha de recepción en 2027 y 2033, y tener
WhatsApp Web abierto para las derivaciones a Finanzas.

**Lo que espera de Carlos.** Cuál de los dos Presu_454-26 se renumera al 599,
que ya está apartado. Si postventa ve o no los documentos del expediente. El
tema de Tomy Jiro, cuyos presupuestos siguen en manos de Santos. Y las doce
contradicciones del documento de procesos (silencio del prospecto, plazo del
preventivo, garantía en Lima, vigencia de la cotización y ocho más), que
bloquean el modelado en Camunda.

**Lo que sigue por el lado del sistema, en orden de valor.** La línea de texto
libre en el cotizador, que es lo único que separa a postventa del Word. Subir
los cierres 30, 31 y 32 cuando Ariana los tenga. Cargar al archivo las 18
cotizaciones de Open que quedaron con numeración de Efameinsa. La derivación de
servicios que no mueva la cartera. Y el pendiente de rendimiento de «Lo que
derivé», anotado en el plan 22.

**Documentos entregados hoy, en Descargas.** «Notas Santos - viernes 04-09
(17h).docx» con los mensajes listos para cada persona; «Reporte semanal
registro CRM 31-08 al 04-09.txt»; «Efameinsa - reglas de negocio y mapa de
procesos para Camunda.txt» con 200 reglas, 19 diagramas y las doce
contradicciones; y «Efameinsa - insumos para manual de identidad
corporativa.txt».

## Respaldo completo del sábado 05-09, para evaluar otra arquitectura

Santos pidió un respaldo completo del CRM porque quiere analizar una
alternativa de arquitectura. El respaldo de siempre (`npm run db:backup`) no
alcanzaba: guarda las filas y deja fuera el esquema vivo, los usuarios, los
adjuntos y las 121 funciones donde vive la mitad de las reglas del negocio.

Quedaron dos archivos en `backups/`:

- **`crm-efameinsa-respaldo-completo-2026-09-05.zip`** (79 MB, 472 archivos).
  Esquema leído del catálogo vivo, las 52 tablas con 146.689 filas sacadas en
  una sola transacción, los 22 usuarios de `auth`, los 101 adjuntos y un
  `git bundle` con todo el historial. Adentro van el `LEEME.md` con el
  procedimiento de vuelta y un `INVENTARIO-TECNICO.md` con los números para
  comparar arquitecturas.
- **`crm-efameinsa-SECRETOS-2026-09-05.zip`**, aparte a propósito: así el
  respaldo se le puede entregar a un tercero sin darle producción.

**Probado, no supuesto.** `scripts/ensayar-restauracion.mjs` levantó el esquema
entero en un esquema temporal de la propia base —52 tablas, 121 funciones, 117
políticas, 150 índices, 3 vistas, 33 triggers, sin un solo error— y lo deshizo.
También se verificó que las 146.836 líneas NDJSON son JSON válido, que los 101
adjuntos son archivos reales (55 JPEG, 37 PDF, 7 PNG, 2 ZIP) y que el bundle de
git tiene historial completo.

**Dos cosas que aprendimos en el camino.** El pooler de Supabase corta la
conexión con `select * from leads` de un tirón (20 MB): hay que ir por tandas
con un cursor del servidor. Y `pg_trgm` y `uuid-ossp` viven dentro de `public`,
así que un volcado ingenuo de «las funciones de public» se lleva un centenar de
funciones en C que después no se pueden restaurar.

**Sigue pendiente:** el respaldo está en el mismo disco que el original. Falta
sacarlo de la máquina —al NAS, a un disco externo o a la nube—, que es
justamente lo que pidió gerencia después del robo del servidor del ERP.

## 05-09 · Un cierre anulado seguía sumando en las métricas (0174)

Santos, por Katerine (C5): «tiene un cierre anulado de ayer, pero todavía le
sigue contabilizando en sus métricas semanales».

**La anulación estaba bien.** El cierre 011-2026 de Sierra Travel y su venta
quedaron anulados el 04-09 a las 17:49, la oportunidad volvió a `seguimiento` y
el 014-2026 nuevo se emitió por 1 987,29. Lo que fallaba era el CONTEO.

**Cuánto se contaba de más.** Katerine, semana del 31-08 al 05-09: se veían
4 ventas y 9 934,07 USD; son 3 y 7 684,07. La diferencia son los 2 250 del
cierre anulado.

**Los cuatro lugares que contaban mal**, y a qué pantalla alimenta cada uno:

| | |
|---|---|
| `v_ventas_detalle` | el tablero de gerencia y el de marketing: monto vendido, número de ventas, ticket promedio, ranking por comercial, vía de adquisición |
| `reporte_diario_comercial` | el reporte del día de cada comercial, y la suma de la semana que sale de él |
| `supervision_diaria` | la supervisión de gerencia. Contaba mal DOS cosas: el monto vendido y los informes emitidos |
| `grupo_economico_def` | lo que un cliente lleva comprado, en su ficha y en la de todas las sedes de su RUC |

**Por qué se escapó, que es lo importante.** Existe una prueba que vigila
exactamente esto —`src/lib/ventas-anuladas.test.ts`, verde desde hace
semanas—: recorre el código y exige que toda consulta a `ventas` filtre las
anuladas o declare por escrito que no. Hace bien su trabajo, pero **solo lee
TypeScript**, y las métricas no se calculan en TypeScript: se calculan en
funciones y en una vista de PostgreSQL. Es el agujero que quedó documentado esa
misma mañana en el informe de arquitectura —5 332 líneas de PL/pgSQL sin una
sola prueba automática— y este fue el primer caso concreto que produjo.

**La otra mitad de la guardia ya existe:** `npm run db:auditar-anuladas` hace
lo mismo sobre el catálogo VIVO de la base. Hoy pasa: ninguna función ni vista
cuenta lo anulado sin declararlo, y las ocho que no filtran tienen su razón
escrita en el propio script. Hay que correrla al tocar funciones de métricas.

**El reporte guardado del 01-09 se corrigió aparte.** `reportes_diarios` guarda
una foto del día, y esa foto no se arregla sola. NO se regeneró el reporte
entero a propósito: trae también la agenda —«pendiente hoy», «vencidas»,
«mañana»—, que se calcula contra el estado actual de las oportunidades, y
volver a correrla hoy daría una agenda que nunca existió ese día. Se tocó solo
la lista de ventas y sus dos totales, con el motivo escrito dentro del propio
reporte (`ajuste_0174`). El script es
`scripts/corregir-reportes-con-venta-anulada.mjs` y sirve para el próximo caso.

**Pendiente de preguntar a Carlos.** En `resumen_gerencia` quedan tres
contadores que siguen sin descontar las anuladas: `ventas_sin_serie`,
`ventas_historicas_total` y `ventas_crm_total`. Cuentan filas cargadas, no
desempeño de nadie, así que se dejaron como estaban — pero conviene que él
decida si deben descontarlas.

La migración no necesitó despliegue: vive entera en la base y tuvo efecto en el
momento de aplicarse.

## 05-09 · La apertura de servicio, en sus tres formatos (0175)

Pedido por Lesly a través de Santos, con tres correos reales de ejemplo
(Mercedarias Misioneras, Peru Vacation Rentals y Motorgas):

> «Una vez que postventa hace todos los pasos —confirmación de finanzas, prueba
> de embalaje, coordinar con el cliente— y llena datos como dirección a dónde
> llega, con qué agencia, la persona que recibe, teléfono y DNI, todo eso va
> plasmado en una APERTURA DE SERVICIO (…) aquí se tienen los tres formatos y
> todo se debe llenar en automático con todos los datos que ya se tienen.»

**Los tres formatos son el mismo.** Solo cambia el encabezado de la fila 1:
`ENTREGA DE:` (va a la agencia), `ENTREGA Y PUESTA EN MARCHA DE:` (el técnico
lo lleva e instala) y `SERVICIO DE MANTENIMIENTO:` (el técnico va a hacer
mantenimiento). El CRM propone cuál es a partir del tipo de servicio y del
destino, y postventa lo corrige si hace falta.

**Qué ya teníamos.** El CRM emitía desde la 0150 una «apertura de despacho»: el
documento interno con el que almacén despacha sin preguntarle a nadie. Lo que
faltaba era el formato que SALE al equipo por correo, con sus nueve filas
numeradas. Son las dos caras del mismo papel, así que ahora van en una sola
hoja: arriba las nueve filas, abajo las condiciones verificadas.

**Qué se llena solo, y qué no.** De las nueve filas, siete salen de lo que ya
está en el sistema: cliente y RUC, dirección (con la DIRECCIÓN FINAL cuando la
entrega es en nuestras instalaciones), quién recibe con su teléfono y DNI, el
equipo con su serie, y las dos últimas, que son constantes del formato
(«Gestión de Contabilidad»). Las cinco cosas que faltaban no vivían en ninguna
parte y viajaban en la cabeza de quien armaba el correo: **la hora, el día, el
técnico que va, cómo se mueve ese técnico y las guías que se piden.** La 0175
les da columna y la pantalla las pide.

**El correo se copia, no se manda.** El CRM no tiene SMTP y las alertas por
correo están apagadas por orden de gerencia, así que hace lo mismo que Central
con el WhatsApp de Tesorería: deja el asunto y el mensaje escritos, y la persona
los pega y los envía. El asunto sale exacto:
`EMPRESA // APERTURA DE SERVICIO // CLIENTE`.

**El estado real de los datos, medido el 05-09.** De 113 pedidos abiertos: 112
traen el equipo, 107 la dirección, 45 el RUC y **solo 1 tiene quién recibe**.
No es una falla del formato: «quién recibe» se llena en el paso de verificar la
dirección con el cliente, que es justo el que describe Lesly. A medida que
postventa haga esa llamada, la apertura sale más completa sola. Lo que falta
aparece como «—» y la pantalla lo enumera arriba: no se inventa nada.

**Lo que queda fuera, a propósito.** El mantenimiento entra por
`servicios_postventa` —hay 15 pedidos así, incluido el de las Mercedarias— y
por ahí funciona. Si algún día un mantenimiento se registra como `atencion` y
no como pedido, esa apertura todavía no existe.

La pantalla se abre desde la ficha del pedido, ahora **siempre visible**: antes
solo aparecía con la apertura ya emitida, y eso dejaba a postventa sin dónde
coordinar la hora y el técnico, que se llenan ANTES de emitir.

Veinte pruebas nuevas usan los tres correos de Lesly como referencia
(`src/lib/apertura-servicio.test.ts`).

## 05-09 · «Ventas sin informe de cierre» que no se iba (Brenda)

Brenda hizo su informe el 04-09 y en su «Mi día» le seguía apareciendo
**Ventas sin informe de cierre (1)** — CORP DE INGENIERIA DE REFRIGERACION
SRL, 3 347,46 USD. Pedía que se lo borraran.

**No había nada que borrar.** El informe existía —**001-2026 de EFAMEINSA**,
emitido el 04-09 a las 18:28— y la venta también, con la misma cotización
(Presu_2211-26) y el mismo cliente. Lo único que faltaba era que estuvieran
**atados**. Los montos ya cuadraban: 3 950,00 con IGV en el informe y 3 347,46
sin IGV en la venta, que es la convención de la casa desde la 0148. Borrar la
venta le habría sacado una venta real del récord.

**El mecanismo que debía hacerlo solo.** Desde la 0105 hay dos disparadores que
atan informe y venta: uno cuando nace la venta y otro cuando se emite el
informe. Los dos exigen que no haya ambigüedad —un solo informe emitido y sin
venta, una sola venta sin informe, mismo cliente, menos de siete días de
diferencia— y si hay dos candidatos no adivinan. Está bien que sea así.

**Por qué no se disparó el 04-09: no se pudo determinar.** Se comprobó en una
transacción de ensayo (revertida) que hoy, sobre este mismo caso, volver a
emitir el informe lo ata solo. Se descartaron: que el trigger no existiera —es
de la 0105 y la 0148—, que la cuenta no coincidiera, que hubiera más de un
candidato de cualquiera de los dos lados, y que `emitir_informe` no tocara
`emitido_at`. Queda como un hecho sin explicar, no como una causa conocida.

**Lo que sí queda:** `scripts/atar-informes-sueltos.mjs`. Busca las ventas del
CRM sin informe y les encuentra su informe emitido y suelto usando **los mismos
criterios del disparador**; ata solo cuando la pareja es única por los dos
lados, y lo ambiguo lo informa sin tocarlo. Corre en seco por defecto y aplica
con `--aplicar`. En todo el sistema había **un solo caso**: el de Brenda.

Corregido en producción. No necesitó despliegue.

## 05-09 · El cierre semanal pide plan y necesidades (0177)

Carlos: «verifiquemos el tema del cierre semanal que coordinamos durante la
semana, respecto a que debe considerarse detallar su planificación y
necesidades».

Lo coordinado está en la reunión del **02-09 (11:47)** y son dos campos, los dos
obligatorios:

> «Que tenga un campo obligatorio para que redactes cuál es tu plan para la
> siguiente semana. No me hables de que vas a llamar a 10 clientes el lunes,
> porque ya está mapeado, está el calendario semanal. No me hables de cuánto vas
> a vender, porque también ya sale automático. Háblame de **qué es lo que vas a
> hacer tú para poder mejorar en tus ventas**.»

> «Y la pregunta del millón: **¿qué necesitas?** ¿Una computadora? ¿Está lenta?
> Ok, tu computadora. ¿Qué necesitas? Necesito capacitación. ¿En qué?»

**Qué había hasta hoy.** El botón «Cierre de la semana» abría directo el PDF con
lo proyectado contra lo vendido, día por día y con lo que quedó pendiente. Los
números estaban; las dos respuestas del comercial, no.

**Qué se hizo.** El botón ahora abre un formulario corto antes del documento:
qué se compromete a hacer, y qué necesita (con una casilla para «esta semana no
necesito nada», porque no necesitar nada también es una respuesta). Se guarda
en `declaraciones_semana`, una por comercial y por semana, y el PDF lo muestra
**arriba, en recuadro granate**, antes del día por día: es lo que gerencia lee
el lunes, no un anexo.

Las reglas viven en la base y no solo en la pantalla: el compromiso exige al
menos 15 caracteres, y o se dice qué se necesita o se marca la casilla — las dos
cosas a la vez no se pueden. La declaración se puede corregir mientras la semana
está fresca (siete días); las de semanas pasadas quedan como quedaron, que es el
registro contra el que se pregunta el lunes.

**El PDF sale con dos clics, a propósito.** Entre el botón y el documento hay un
guardado que espera al servidor, y el navegador bloquea las pestañas que no
nacen de un gesto directo. Así que se declara, y recién entonces aparece
«Bajar el documento».

**Lo que queda pendiente de esa misma reunión**, y no entró acá:
- El gráfico de los **rechazados de la semana por motivo**, con su detalle:
  «de los errores uno aprende (…) pero no quiero aprender yo nada más, tiene
  que aprender todo el equipo».
- El **velocímetro de ventas del mes** en «Mi gestión», que Carlos echó de menos
  el 02-09.
- Que el botón **aparezca solo el sábado a las 11:55**. Hoy está siempre
  disponible, que es más útil mientras el equipo se acostumbra.
- El **histórico de cierres** por comercial: los datos ya se guardan, falta la
  pantalla que los liste.

### Corrección del mismo 05-09: los tres pendientes ya no lo están

Los tres puntos que arriba quedaban «pendientes de la reunión del 02-09» se
hicieron el mismo día, a pedido de Santos:

- **Rechazados por motivo**: sección 4 del PDF del cierre semanal, con la torta
  y la lista completa cliente por cliente. La torta se dibuja con arcos dentro
  del propio PDF, sin librerías.
- **Velocímetro del mes**: arriba de «Mi gestión» y sin depender del filtro de
  período. Estaba, pero medía el período elegido, y el que trae la pantalla por
  defecto es la semana — por eso al entrar no se veía ninguno, que fue
  exactamente lo que notó Carlos.
- **El botón del sábado**: los sábados desde las 11:55 (hora de Lima) el botón
  se vuelve granate, grande y dice «Ejecutar su cierre semanal». Fuera de esa
  hora sigue disponible discreto, para que gerencia pueda revisar cierres de
  semanas pasadas y nadie quede sin abrir el suyo.

Sigue pendiente solo la **pantalla del histórico de cierres**: los datos ya se
guardan en `declaraciones_semana`, falta listarlos.

**05-09, mañana — sesión «CRM SERVIDOR»: piloto SOLO en línea, sin el servidor de la empresa.** Santos redefinió el alcance: nada de trabajo sin internet por ahora, nada del servidor (sus unidades T–Z ya no autentican: Sistemas cambió/retiró la cuenta `efameinsa\administrador`), solo una carpeta de su PC con ~10 clientes de prueba. Hecho: (1) carpeta piloto `C:\Users\diseno\ArchivoCRM\{fotos,informes,entrada}`; (2) **máquina virtual `archivo-crm` en Hyper-V** (Ubuntu 24.04, `D:\VMs\archivo-crm\`, LEEME.txt) con `scripts/servidor-archivos.mjs` como servicio systemd en el puerto 8731, Samba `\172.29.194.124\archivo` para dejar los archivos, cloudflared instalado; armada sin permisos de administrador (imagen cloud + cloud-init con disquete FAT12 hecho en Node); (3) probada de punta a punta por túnel trycloudflare: PDF firmado 200, carpeta 200, fuera de raíz 403, sin firma 410; punto de control «base lista 05-09». Detalle en la memoria `vm-archivo-crm-hyperv`. **Pendiente:** dominio de prueba de Santos en la cuenta de Cloudflare (la de R2) para el túnel con nombre fijo → poner `ARCHIVOS_URL` y `ARCHIVOS_SECRETO` (uno fuerte nuevo, en los dos lados) en Vercel; como el túnel es https, `documentos-del-servidor.tsx` puede incrustar la galería en vez de abrir pestaña nueva; adaptar `indexar-carpetas-servidor.mjs` para raíces Linux `/srv/archivo/...`; piloto de correo con el dominio de prueba (Email Routing + Resend; buzones reales no van en la PC). El DNS interno de la oficina (192.168.10.212) no resuelve *.trycloudflare.com ni deja salir a 1.1.1.1: probar con DoH + `curl --resolve`.

**05-09, 11:30 — el piloto se ve desde el CRM en local.** `.env.local`: `ARCHIVOS_URL=http://172.29.194.124:8731` (la VM). Cuenta de práctica C0 (comercial0@gmail.com) con su banco recién creado (`crear-banco-comercial-c0.mjs`, 6 clientes «(PRÁCTICA)»); carpetas en la VM para esos 6 y para los 10 «PRUEBA» de PV0; `scripts/_vincular-piloto-vm.mjs` (untracked) registró 32 carpetas en `carpetas_servidor` y llenó `cuentas.carpetas_servidor` con rutas Linux `/srv/archivo/{fotos,informes}/<razón social>`. Verificado con Chrome headless: la ficha `/comercial/cartera/<id>` muestra «Documentos del servidor» → «Abrir carpeta» (pestaña nueva, http). Para producción faltan: dominio de prueba en Cloudflare → túnel con nombre → `ARCHIVOS_URL` https + `ARCHIVOS_SECRETO` fuerte en Vercel (y en la VM) → entonces `documentos-del-servidor.tsx` puede incrustar la galería en vez de abrir pestaña.

**CIERRE 05-09 (sesión «CRM SERVIDOR») — dónde retomar el lunes 08-09.** Hecho hoy: VM `archivo-crm` en Hyper-V con el servidor de archivos, Samba y cloudflared; C0 (comercial0@gmail.com) con banco de práctica y carpetas vinculadas; verificado en local que la ficha muestra «Documentos del servidor» y abre la carpeta. **Lunes:** Santos confirma el dominio de prueba `activasme.site` (hoy no resuelve) y lo pasa a la cuenta de Cloudflare de la empresa; luego túnel con nombre `archivo.activasme.site` como servicio en la VM, secreto nuevo, `ARCHIVOS_URL`/`ARCHIVOS_SECRETO` en Vercel dentro de ventana, ajuste de `documentos-del-servidor.tsx` (nota y galería incrustada por https), y piloto de correo (Email Routing + Resend). Santos copia sus clientes reales a `\172.29.194.124\archivo`. Scripts sin versionar de hoy en `scripts/_diag-*.mjs` y `scripts/_vincular-piloto-vm.mjs` (borrar o versionar al retomar). Detalle: memoria `vm-archivo-crm-hyperv`.

**05-09, 12:30 — el archivo de la VM ya se ve en PRODUCCIÓN.** Túnel `archivo-crm` → https://archivo.activasme.site (dominio de prueba de Santos en Cloudflare), secreto nuevo en la VM y en Vercel (`ARCHIVOS_URL`, `ARCHIVOS_SECRETO`), commit 8dc28e5 (nota de la ficha) desplegado a las 12:18 dentro del push 68db2e4 de otra sesión. Verificado: C0 en crm.efameinsa.com ve «Documentos del servidor» con «Abrir carpeta» por https. Solo aparece en cuentas con carpeta vinculada (16 de práctica); para el resto no cambia nada.

## 05-09 (11:29) · Carlos revisó el cierre semanal en vivo, y lo que salió de ahí

Reunión grabada mientras miraba el cierre de Brenda recién desplegado. Todo lo
que pidió se hizo el mismo día. Migraciones 0178, 0179 y 0180.

### Lo que ya está en producción

**Cada número contra su meta** (desplegado 12:05). «Contacto con clientes, sí,
¿pero de cuántos? Acá me dice que está todo bien: voy a ir a hacer fiesta hoy
día. Falta compararlo con algo.» Las tarjetas dicen 141 de 210 · 67%, con barra
y color; el día por día dice 49 / 35; y una franja cierra con el veredicto y una
frase — «no es darle con palo, sino ver tu realidad».

**El aviso cuando la proyección está vacía.** Era su reproche de fondo: a quien
vendió 14.981 contra una meta de 32.000 no se le puede decir «a favor» porque
proyectó 1.772. Si lo proyectado no llega ni a un tercio de la meta, el
documento lo dice.

**El acumulado del mes** en el histórico, con cada semana etiquetada.

**Central devuelve el cierre mal hecho (0178).** «¿Para qué le derivas si está
mal? Tendrías que rechazarlo y que lo haga bien.» Devolver no es anular: el
número se conserva y lo que cambia es de quién es el trabajo. Sale de la cola de
Central —pestaña «Devueltos»—, aparece arriba en «Mis cierres» del comercial con
el motivo escrito, y vuelve cuando él dice «ya lo corregí». Cada vuelta queda
registrada.

**El aviso a Finanzas también por correo.** A `Contabilidad1@efameinsa.com`, por
n8n, además del WhatsApp. No pasa por `AVISOS_CORREO`: ese interruptor apaga las
alertas de leads al correo de gerencia que él mandó quitar el 04-09; este es
otro correo y lo pidió él mismo.

**La proyección dice CUÁL cotización se va a cerrar (0179).** Su propia
solución para el caso del cliente con tres cotizaciones. En la tarjeta del
cuadro semanal aparece «¿Cuál va a cerrar?» solo cuando hay más de una. Sigue
siendo opcional. La 0180 fue detrás: la 0179 dejó viva la versión de dos
parámetros y la llamada quedaba ambigua — se detectó en el ensayo, antes de
desplegar.

### Lo que sigue pendiente de esa reunión

- **El «no hay anular» de la derivación.** Carlos buscó y no lo encontró. **Sí
  existe** desde la 0171, con PIN, pero vive solo en `/central/derivados`, en
  «Avisos que mandé a otras áreas». Hay que decírselo o ponerlo también donde
  él miró.
- **La duplicidad en el historial** cuando Central deriva el aviso al mismo
  comercial que registró el pago (audio de las 11:19): «que no haya duplicidad;
  tendría que aparecer la hora, nada más, que él le reenvió la central a
  usted». No se tocó: la forma exacta de resolverlo no está clara y hacerlo a
  ciegas puede empeorar el historial.
- **Verificar que el WhatsApp a Finanzas quede grabado.** Santos iba a pedir
  feedback; todavía no lo hay.

### Fuera del CRM

Carlos tiene la laptop llena: 1 TB, de los cuales ~750 GB son correos en un
PST. Alternativas conversadas: disco externo, o correo corporativo de Google
(≈US$ 5/mes con 2 TB). Santos iba a mirar precios.

---

# Dónde quedó todo el sábado 05-09, y por dónde sigue el lunes

Siete migraciones (0174 a 0180), quince commits y seis despliegues. Producción
corre `97c837f`. Todo lo aplicado está verificado en producción, no supuesto.

## Lo que se hizo hoy, en orden

**El respaldo completo** (`crm-efameinsa-respaldo-completo-2026-09-05.zip`, 79 MB
en `backups/`): esquema leído del catálogo vivo, 52 tablas con 146.689 filas
sacadas en una sola transacción, los 22 usuarios, los 101 adjuntos y un git
bundle con todo el historial. Se comprobó levantándolo entero en un esquema de
ensayo. Los secretos van en un zip aparte. **Sigue pendiente sacarlo de la
máquina**: está en el mismo disco que el original.

**El informe de arquitectura para auditoría externa**, publicado como página y
también en `Descargas` como texto para pegar en un chat. Trae el análisis del
reproche del monolito y seis preguntas concretas para el auditor.

**0174 · Lo anulado no cuenta en ninguna métrica.** El cierre anulado de
Katerine seguía sumando en su semana, en el tablero de gerencia y en la
supervisión. Cuatro lugares contaban mal, entre ellos la vista de la que come
todo el tablero. Queda `npm run db:auditar-anuladas` como la mitad SQL de la
guardia que ya existía para TypeScript.

**0175 · La apertura de servicio en sus tres formatos** (pedido de Lesly). Siete
de las nueve filas se llenan solas; las cinco que faltaban —hora, día, técnico,
transporte y guías— ahora tienen columna. El correo sale escrito, para copiar.

**0176 · Al emitir, el informe ata su venta.** El caso de Brenda. Se descartó
una por una toda hipótesis sobre por qué el disparador no se activó el 04-09 y
**no se pudo determinar**; queda dicho así. La emisión dejó de depender de él.

**0177 y lo que siguió · El cierre semanal.** Plan y necesidades obligatorios
antes del documento, la torta de rechazados, el velocímetro del mes, el botón
del sábado a las 11:55, el histórico con acumulado, y —después de que Carlos lo
revisara en vivo— cada número contra su meta con color y una frase.

**0178 · Central devuelve el cierre mal hecho**, y el aviso a Finanzas también
por correo a Contabilidad1@efameinsa.com.

**0179 y 0180 · La proyección dice cuál cotización se va a cerrar.**

## Por dónde seguir el lunes

1. **Que a postventa el aviso no le llegue «seco».** Es el único problema
   confirmado por quien lo sufre, no una hipótesis. Hoy cae como una línea
   suelta en las observaciones del pedido, sin cliente, sin equipo, sin qué se
   pagó. **Es lo primero.**

2. **La marca visual del aviso en el historial.** Que se distinga de un vistazo
   lo que gestionó el comercial de lo que le reenvió Central. Ya no infla
   indicadores; lo que falta es que no se LEA como dos gestiones.

3. **La duplicidad del historial: no fusionar automáticamente.** Se revisaron
   los cuatro avisos reales del 04-09: tres dejaron una sola entrada y el cuarto
   tiene dos que son hechos distintos con cuatro horas de diferencia. La
   duplicación que Carlos temía todavía no ocurrió. Si aparece, que la resuelva
   Central con un clic —«¿esto ya lo registró el comercial?»— y no una regla
   automática, que tarde o temprano borraría un hecho real.

4. **Decirle a Carlos que el «anular» de la derivación SÍ existe**, desde la
   0171 y con PIN. Vive en `/central/derivados`, en «Avisos que mandé a otras
   áreas». Él buscó en otro lado y concluyó que no estaba: hay que preguntarle
   dónde miró y ponerlo también ahí.

5. **Verificar que el WhatsApp a Finanzas quede grabado.** Santos iba a pedir
   feedback y todavía no lo hay.

6. **Sierra Travel** sigue como quedó el viernes, y los pendientes de Ariana,
   Lesly y Central del cierre anterior.

## Fuera del CRM

Carlos tiene la laptop llena: 1 TB con ~750 GB de correos en un PST. Se
conversaron disco externo o correo corporativo de Google (≈US$ 5/mes con 2 TB);
Santos iba a mirar precios.
