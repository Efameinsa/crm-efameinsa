# Reunión del 15-09 y los formatos de Lesly (16-09-2026)

Todo lo de esta página está en producción (`main`, migraciones 0237–0243) y
verificado con sesiones reales (`scripts/_verificar-reunion-15-09.mjs`, 19/19;
humo 38/38). Transcripciones de la reunión: `Downloads/reu15.09` (7 audios).

## Lo que pidió Carlos y cómo quedó

| Pedido | Dónde está |
|---|---|
| Aviso al comercial cuando Central anula su cierre, con el motivo | `anular_cierre` (0237) → campanita `cierre_anulado` |
| El rechazo de gerencia dice qué cotización; el motivo queda como histórico; la rechazada NO se edita, se hace otra (Santos: sin duplicar) | `cotizacion_decisiones` (0237, con las 133 anteriores), pantalla `CotizacionRechazada`, histórico en Gerencia → Aprobaciones |
| Ejecutar un pedido sin liquidación pide PIN; postventa no ve ni aprueba hasta el check de Central | `liberar_pedido_postventa(p_pin)` (0237), `checks-pedido-central`, filtros en cola/control/macro |
| Registrar seguimiento en postventa sin abrir caso ni pasar por Central | `expediente_para_seguimiento` (0238), `tipo_postventa='seguimiento'`, botón en la ficha → expediente con `?gestion=1` |
| Visita a planta → Central imprime para vigilancia | `visitas_planta` (0238–0243), `/central/visitas`, correo del formato de Katerine (`AVISOS_VISITA_PARA`) |
| Varios equipos en un caso | `oportunidades.series_adicionales` (0238) |
| Cambiar el tipo de atención desde cualquier tipo, antes de planificar | `cambiar_tipo_atencion` (0238) |
| Atenciones programadas y visitas en la agenda; «0 despachos» con Gary programado | `eventoDeAtencion`, `eventoDeVisita`, `casilleroDelPedido` |
| Buscador que «se retrocede» | `BusquedaEnVivo` y los tres filtros: no se sobreescribe con la URL vieja |
| Circuito según lo vendido (equipo / repuesto / mantenimiento / revisión) | `servicios_postventa.tipo_pedido, entrega_en, con_instalacion`; `circuitoDe` + `bloquesPedido`; `TipoPedidoSelector` |
| Pedidos anteriores al circuito | `traer_pedido_antiguo` (0239) + el tablero de Pedidos ahora incluye las filas del Excel |
| El macro del área con filtros y la lista para llamar | `/postventa/macro` |
| Los formatos de postventa se generan solos | correo de visita (0241/0243), orden de trabajo (n8n, encendida el 16-09), informe técnico imprimible `/postventa/informes/<id>/imprimir` (0242) |

## Correos (16-09)

- Visita: `central, contabilidad1, logistica2, sistemas, almacen, almacen1, crcabrejos, kycabrejos @efameinsa.com` (Vercel `AVISOS_VISITA_PARA`).
- Orden de trabajo: `almacen, almacen1, logistica2 @efameinsa.com` (flujo n8n, `ORDEN_TRABAJO_CORREO=si`). Las de práctica no la disparan.
- Las `@openinvestments.com.pe` están anotadas y sin usar: la atención no sabe de qué empresa es la venta.
- Gerencia es `crcabrejos` y `kycabrejos`; `gerencia@efameinsa.com` NO es gerencia (solo se usó en una prueba).

## Lo que se espera de Lesly / Brenda

1. De los 48 cierres Open 2026 en Word (R:\ el 16-09, `scripts/_censo-open-2026.mjs`), 14 no tienen rastro en el CRM: Greenbox 167-26, Solandra 428-26, D'Carlo, Malu Service, Las Condes (2), Hermanas Franciscanas (6), Logisminsa, Perubar (2). ¿Cuáles siguen sin despachar? Solo esos se traen a preparación.
2. Estado de Tomihiro y de los equipos en planta (qué se hizo desde el 07-08).
3. Dos criterios del circuito de repuestos: ¿la entrega en planta necesita apertura?; ¿la apertura de servicio la emite postventa antes de que salga el técnico?

## Pendientes propios

- Amarrar los repuestos del informe de revisión al cotizador.
- Regla «según la empresa» para los correos `@openinvestments` si Santos la define.
- El «Reprogramar se colgó» de Turismo Costa del Sol no se reprodujo; si vuelve, pedir cliente y hora.

## Reunión 16-09, 17:39 (Carlos, Lesly) — lo ajustado el mismo día

- Postventa aterriza en **El macro** (`/postventa/macro`), que va primero en el menú; «Pedidos en curso».
- **Visitas a planta** en el menú del área (`/postventa/visitas`, solo lectura).
- **Mi gestión** (velocímetro) para postventa: 0245 deja entrar la cuenta en `resumen_gerencia` cuando se pide por ella; meta provisional US$ 25 000/mes en PV, PV1 y PV2 (la cifra del área que dio Carlos; falta repartirla).
- Las listas con texto largo ya no ensanchan la página (control por paso medía 5 700 px; atenciones 7 700 px).
- Confirmado en vivo: el seguimiento se registra en el expediente; la puesta en marcha se engancha al pedido (0244).

**Pendiente de esa reunión (grande): el módulo de ALMACÉN.** Usuario propio con: sus
pedidos (los mismos de postventa), avisos de «prueba la máquina» → sube protocolo y marca
probado/embalado; recibe la programación del despacho y confirma que está listo
(montacarga); registra la salida con 5 fotos (frente, lateral izq., lateral der.,
posterior, arriba) + video; en la agencia sube foto de la guía y de la máquina y marca
despachado; postventa da el doble check. Ve las visitas a planta (recojo de repuestos),
los informes técnicos y su macro: puesta en marcha, despachos, mantenimiento, soporte
técnico. Nombre acordado: **almacén** (no logística). Diseño antes de construir.

**KPIs de postventa para proponer mañana** (datos reales): ventas de servicio/repuestos
2026 por mes: ene 14 k, feb 7 k, mar 26 k, abr 15 k, may 5,5 k, jun 9,7 k, jul 49 k,
ago 18 k, sep (al 16) 4 k USD → promedio ~18 k/mes; la meta de 25 k es +40 %. Gestiones
de contacto del área: 33–43 por semana (una sola cuenta PV); PV1 recién arranca.
Todavía no hay cotizaciones enviadas desde las cuentas de postventa (las hacen en Word).

## 17-09 — El módulo de almacén, construido (0246)

Cuenta `almacen@efameinsa.com` (perfil «Almacén», código ALM, llave `es_almacen`, rol
comercial como postventa). Aterriza en `/almacen`. Pantallas: Mi día (cuadros: por probar,
despachos de hoy, programados sin confirmar, atrasados, con apertura, salieron sin guía,
aprobados sin pedido de prueba; puestas en marcha / mantenimientos / soporte programados;
visitas de la semana; y lo de hoy con hora), Pedidos (mismos que postventa, sin cifras, con
filtros), la ficha del pedido con las cuatro tarjetas del almacén (probado y embalado con
protocolo → listo para el despacho programado → salida con 5 fotos + video → guía en la
agencia), Atenciones programadas, Visitas a planta, Informes técnicos. Postventa ve las fotos
del almacén en su pedido y da el **doble check** (paso «Despacho verificado por postventa»).
Avisos cruzados: postventa → almacén (prueba pedida, apertura, despacho programado, atención
programada, visita); almacén → postventa (probado, listo, salió, guía). RPCs
`almacen_marcar_probado / almacen_confirmar_listo / almacen_registrar_salida /
almacen_registrar_agencia / verificar_despacho`. Verificación: `scripts/_verificar-almacen.mjs`
(19/19). Lesly (operaciones) también ve la barra de Almacén.

Dato para postventa: Mi día del almacén muestra 59 «atrasados» — son los pedidos del Excel
con fecha de despacho pasada que nunca se marcaron como despachados. Hay que cerrarlos o
marcarlos.

## 17-09 (tarde) — Central gestiona la visita (0247) y los datos de prueba

- La visita ahora es el capítulo 1 de la inducción de Catherine: acompañantes con DNI, máquina a
  ver (quitar film), lavandería, TV, Infocorp; y los checks de Central: vigilancia avisada,
  Infocorp enviado, lavandería abierta, film retirado, TV listo, **Llegó** (avisa al comercial
  «baje a recibirlo»), no vino, vuelto a embalar. Almacén marca lavandería/film/TV/re-embalado
  desde su pantalla; postventa mira. Central registra también la visita de improviso.
- El rótulo del encabezado dice «Postventa · PV1» / «Almacén · ALM» en vez de «Comercial».
- **almacen@efameinsa.com está en modo práctica (es_prueba = true)** mientras se prueba el
  módulo: ve los datos sembrados por `scripts/datos-prueba-almacen.mjs`. Al pasar a operación
  real: `update perfiles set es_prueba = false where codigo_comercial = 'ALM'`.

## 17-09 (noche) — Tomar foto o subir, en todos los puntos donde entra una imagen

- Santos: «en todas las partes que sale protocolo y fotos de prueba deberían salir la opción de
  subir foto o tomar foto (con cámara cuando estén desde dispositivos móviles)». Componente
  `tomar-o-subir.tsx` (`TomarOSubir`, `TomarOSubirVarias`, `useConCamara`): dos inputs, uno con
  `capture` (cámara) y otro sin él (galería o PDF). El botón de cámara solo aparece en celular o
  tablet (`pointer: coarse` y menos de 1100 px); en la laptop abriría la webcam.
- Aplicado en: los cinco ángulos y el video de la salida, la guía y la máquina en la agencia, el
  protocolo de la prueba, el registro fotográfico del informe técnico y `CampoAdjuntos` (caso,
  captura de Central, pasar contacto, expediente).
- De paso: en el celular la barra lateral arranca plegada (se comía media pantalla) y
  `_pantallazo.mjs` acepta `MOVIL=1` para ver la pantalla como teléfono.

## 17-09 (noche) — WhatsApp: la rama entra a main y el webhook queda verificado en producción

- Santos: «ya he creado el api de whatsapp, ya podemos conectarlo». Los cinco commits de la rama
  `whatsapp-api` que faltaban en main (fotos/documentos/audio/video desde el chat, filtro por
  comercial, audio grabado y stickers, compositor en una píldora, fix del Button) se pasaron por
  cherry-pick; sus migraciones 0234/0235 ya estaban aplicadas en la base.
- En Vercel quedan `WHATSAPP_VERIFY_TOKEN` (nuevo, también en `.env.local`) y `WHATSAPP_APP_SECRET`
  (= `META_APP_SECRET` de la app **crm-desarrollador**, 1037022052275908). El GET de verificación
  responde el challenge y `_verificar-whatsapp-webhook.mjs` con `BASE=https://crm.efameinsa.com`
  pasa entero (lead + conversación + status, y se limpia).
- El `META_ACCESS_TOKEN` local es de usuario del sistema **Crm-Infofb** con
  `whatsapp_business_messaging` y `whatsapp_business_management`, pero **sin ninguna cuenta de
  WhatsApp asignada** (`assigned_whatsapp_business_accounts` vacío) y la app no tiene webhook.
- **Falta de Santos**: el identificador del número (`WHATSAPP_PHONE_NUMBER_ID`), el de la cuenta
  (`WHATSAPP_WABA_ID`), y asignar esa cuenta al usuario del sistema (o darme el token del panel);
  luego registrar el webhook en la app con la URL y el verify token, y suscribir `messages`.

## 17-09 (14:25) — WhatsApp conectado de verdad: entra y sale

- Prueba real con el celular de Santos (perfil «marketing», 51949304862) al **+51 932 766 654**:
  el «Holis» llegó al webhook, creó la conversación y el lead **PRO-09464** (canal whatsapp,
  pendiente de triaje en Central); la respuesta salió por la Cloud API y Meta devolvió
  sent → delivered → read. Sin método de pago, las respuestas dentro de las 24 h salen igual.
- Lo que faltaba y lo destrabó Claude en Chrome: el interruptor **«Suscribirse a webhooks»** de
  la cuenta Efameinsa en el panel de la app, y pasar la app a **Activo/Publicada** (política de
  privacidad `www.efameinsa.com/politica-de-privacidad`, términos `/terminos`).
- El WABA ID real es **1218328843849181** (el que dio el panel tenía un dígito cambiado: …643…);
  corregido en Vercel y `.env.local`. Cuenta «Efameinsa», APPROVED, app suscrita.
- Se borró la conversación de prueba «Juan Pérez PRUEBA» del 14-09.
- Pendiente: método de pago en la cuenta (necesario para plantillas / mensajes que inicia la
  empresa), verificación del negocio (en revisión), cargar `campanias_whatsapp` con los códigos de
  anuncio, y el texto del acuse automático.

## 17-09 (15:30) — Teléfonos recuperados para 1 095 fichas

- Ariana (C4) no veía el teléfono de AÑAÑOS PEREZ EDUARDO: la ficha nació del cierre de postventa
  0027 (2024) sin contactos, y los teléfonos estaban en los registros históricos de Central de
  2021 que nunca se unieron a la ficha (sin RUC/DNI y con el nombre escrito distinto). Se le
  crearon tres contactos y se unieron los cuatro registros.
- El problema era general: **2 246 fichas sin ningún teléfono** (C5 1 363, C4 519, C1 308,
  PV 57). `scripts/_recuperar-telefonos.mjs` cruza cinco fuentes que nunca se habían unido a las
  fichas —registros históricos de Central (`leads`), `cotizaciones_historicas` y los tres JSON del
  import del Excel— por RUC/DNI o por nombre normalizado exacto. **Aplicado**: 1 296 contactos en
  1 095 fichas (367 por documento, 728 por nombre; el cargo del contacto dice de dónde salió y
  «confirmar» cuando fue por nombre) y 420 registros de Central unidos a su ficha. Quedan: C5 617,
  C4 349, C1 156, PV 34.
- Lo que queda de Ariana (349) está en `Downloads/ariana-fichas-sin-telefono-17-09.xlsx`: 101 con
  nota de «no contesta / sin teléfono», 115 históricos sin RUC/DNI ni dato, 5 de cierres de
  postventa. Los informes técnicos de Y: no traen teléfono (revisado con Añaños).

## 17-09 (16:30) — Perfil, catálogo y «Mandar equipo» en la bandeja de WhatsApp

- **Perfil del +51 932 766 654**: foto = isotipo en cuadrado blanco 640×640 con aire
  (`Downloads/whatsapp-perfil-efameinsa.png`), descripción «Corporación Efameinsa e Ingeniería
  S.A. Fabricantes y distribuidores de las mejores marcas de lavandería industrial.», web.
- **Catálogo desde el CRM**: `/api/marketing/catalogo-whatsapp?clave=…` (CSV de Meta; solo
  equipos activos con SKU, foto y precio de lista con el orden del cotizador). Claude Chrome
  creó el catálogo **2221581735430168** en Commerce Manager con feed diario 03:00 Lima
  (feed 2165393001075471): 129 artículos. Conectado a la WABA por API; **oculto del perfil**
  (`is_catalog_visible=false`, carrito apagado): el cliente solo ve un producto cuando se lo mandan.
- **«Mandar equipo» (0250)**: botón 📦 en la caja del chat → buscador de equipos → «Mandar ficha ·
  sin precio» (interactive button: foto + ficha + Me interesa / Pedir cotización / Ver otra opción)
  o «Del catálogo · con precio» (interactive product / product_list, `WHATSAPP_CATALOGO_ID`). Lo
  que toca el cliente vuelve al hilo con `equipo_sku`; también `order` y `context.referred_product`.
  Probado con el celular de Santos: la ficha de la LG Titan Max llegó y sus dos toques volvieron.
- Pie de la tarjeta: **«Efameinsa · Ingeniería Certificada»** (Santos corrigió «peruana»).
- **Pendiente**: el envío de producto del catálogo da «product not found» aunque el ítem está
  publicado y con foto: Meta revisa los artículos para WhatsApp (hasta 24 h). Reintentar mañana;
  si sigue, mirar WhatsApp Manager → Catálogo → estado de revisión.

## 18-09 — Los informes del almacén, rango de fechas y calendario (0252)

- Santos trajo la lista de Lesly: prueba y embalaje y despacho = fotos + check (ya estaban, 0246);
  lo nuevo son los informes que el almacén escribe y **sube a postventa con un check**: puesta en
  marcha (todo OK / con observaciones / faltan accesorios para instalar, con lista de materiales y
  costos), soporte técnico por videollamada, y mantenimiento en planta en tres informes
  (recepción, prueba y revisión, ejecución).
- Viven en `informes_servicio` con `clase_almacen`, `atencion_id`, `lista_materiales`,
  `elevado_a_postventa_at/por`; RLS de escritura para el almacén sobre los suyos; RPC
  `elevar_informe_a_postventa` avisa a cada persona de postventa (misma serie) y deja la fecha de
  puesta en marcha en el pedido. Impresión con la tabla de materiales y total estimado.
- Pantallas: «Informes técnicos» (al final del menú) con filtros por origen y clase, «Nuevo
  informe» (elige de qué pedido o atención), «Subir a postventa», «Ver el pedido» (sin precios);
  «Pedidos» con rango de fechas de despacho; «Calendario» = el de postventa en solo lectura
  (despachos, puestas en marcha, atenciones con técnico, visitas).
- Probado con la cuenta de práctica: informe 913-2026 (faltan accesorios) creado, subido, aviso
  a PV0, fecha en el pedido PRUEBA-913.
- Avisado también hoy: Brenda no podía corregir el 016-2026 por un regex sin barra en
  `abrirCorreccionInforme` (desde el 02-09); y `validar_pin_supervisor` ahora acepta el código de
  Lesly como el resto (0251).

## 18-09 — Reunión 09:55 (Carlos): varias máquinas por caso y las series del pedido (0253)

- Gary Group: postventa no podía «agregar las 4 máquinas» al caso. Carlos: «¿no serían cuatro
  casos? sería mucho rollo; mejor que se pueda agregar… cuando llama por un problema yo tengo que
  relacionar la serie con el problema». Decisión tomada: **un caso lleva varias máquinas**
  (principal en `equipo_id` + `atencion_equipos`); en el caso, «Las máquinas de este caso» con
  agregar/quitar; fichar otra con la principal puesta la suma; la página de la máquina lista los
  casos donde estuvo.
- La causa real de Gary Group: el pedido salió el 15-09 con guía (cierre 019-2026: 2 Titan Max
  17 kg + 1 Giant C Max) y **nadie registró las series** — la única puerta era «Cerrar pedido».
  Ahora el bloque «Series de las máquinas de este pedido» (postventa y almacén) las registra sin
  cerrar, y el Paso 1 del caso dice «tiene un pedido que salió el … con guía …, nadie registró
  las series» con enlace al pedido. Lo que postventa tiene que hacer: poner las 3 series en el
  pedido de Gary Group y volver al caso.
- Otros puntos de la reunión: Carlos quiere en «Informes técnicos» del almacén la vista **por
  cliente → por máquina** con todo lo hecho en orden (protocolo, despacho, puesta en marcha,
  mantenimientos, videollamadas) — pendiente de construir; las visitas a planta «no están
  mapeadas»: hace falta explicarles a Central y comerciales cómo registrarlas; fotos de productos
  con Ariadna (planos por definir por Santos); y para el curso de inducción, no flexibilizar el
  procedimiento de vigilancia (sin DNI no entra; gerencia solo para precios y negociación).

## 18-09 (tarde) — Lo que faltaba de la reunión 09:55

- **Informes técnicos por cliente → por máquina** (`/almacen/informes/clientes`, `/clientes/[id]`,
  `/equipos/[id]`): la línea de tiempo de la máquina con los tres hitos del pedido (prueba, despacho,
  puesta en marcha; en gris si no se hicieron) y luego cada informe y cada caso por fecha. Sin
  precios. Enlace «Por cliente →» en la lista de informes.
- **Guía de visitas a planta** (una página, PDF): `Downloads/guia-visitas-a-planta.pdf` (+ .html),
  para repartir a Central, comerciales, postventa, almacén y vigilancia.
- **Fotos de productos**: `Downloads/fotos-de-productos-lista-y-pauta.xlsx` — hoja «Equipos» con
  los 130 activos (ficha en el CRM sí/no, página web sí/no y cuántas fotos, columnas para marcar
  showroom y fotos tomadas) y hoja «Pauta de fotos» con los 12 planos y el orden de trabajo.

## 18-09 (tarde) — El circuito de la visita se cierra (0256) y los ajustes al curso

- Diagnóstico: 0 visitas reales registradas; el comercial anunciaba desde la ficha y no tenía
  ventana ni cierre. Ahora: menú **Visitas a planta** del comercial (las suyas), circuito en cada
  visita (Anunciada → Vigilancia avisada → Preparada → Llegó/No vino → Atendida y registrada →
  Vuelto a embalar) y **«Registrar la visita (resultado)»** (compró, pide cotización, evaluando,
  recogió, pagó, solo miró, no vino) → `cerrar_visita_planta` escribe la gestión tipo `showroom`
  en la oportunidad viva. Probado con C0. Columnas compartidas en `lib/visitas-planta-columnas.ts`
  (exportarlas desde el componente «use client» rompía la página del comercial).
- Para capacitación: `Downloads/capakat1/AJUSTES-18-09-visitas-y-vigilancia.txt` (qué cambiar en
  clases 1-3, banco de preguntas, regrabar audio 2 y 3) enviado a las sesiones bin-f2 y bin-d7;
  `Downloads/visitas-a-la-planta-instrucciones-de-gerencia.txt` (instrucciones textuales del
  gerente) y `guia-visitas-a-planta.pdf` actualizados con el paso de cierre.
- 18-09 15:40: **almacen@ pasa a modo real** (`es_prueba=false`): 124 pedidos en curso y 68
  atenciones abiertas reales; los avisos (prueba pedida, apertura, despacho programado, visita,
  orden de trabajo) le llegan de verdad. La práctica queda en practica.almacen@.

## 18-09 (tarde) — Plan de campañas 2026-IV y cableado (0257)

- `Downloads/plan-campanas-pagadas-2026-IV.docx`: diagnóstico con números del CRM (Google ≈ S/29 000
  en 2026 por el formulario de Google, 0 ventas trazadas; Meta S/3 809 → 2 401 conversaciones a
  S/1,59, sin píxel; la web nueva 20 % cotizados), fase 0 de cableado, fases 1-3 (del informe de
  Meta del 12-09), inversión ≈ S/7 600/mes, orquestación semanal y **reparto de WhatsApp por
  turno** (no aleatorio; cartera manda; rebote a los 15 min; Central supervisa) — pendiente de
  aprobación de gerencia.
- Corrección al plan: la Conversions API **no existía** en el CRM; se construyó hoy
  (`src/lib/meta-capi.ts`, tabla `eventos_meta`): Contact / Lead / SubmitApplication / Purchase.
  Falta `META_CAPI_TOKEN` (Claude Chrome). `leads.fbp/fbc/registro_web` (0257). Acuse automático
  al primer mensaje de una conversación nueva, con horario. Códigos M1-A/B/C creados.
- Los 23 cierres de 2026 «sin lead»: 16 no tienen oportunidad de lead y 7 sí tienen oportunidad
  pero sin lead candidato en 180 días — se vendieron sin pasar por un lead (cartera/presencial). No
  es un fallo de enlace; el enlace existe cuando Central deriva.
- Instrucciones detalladas enviadas a la sesión «proyecto web efameinsa»: atribución al crear la
  cuenta (`perfiles.atribucion/origen`), excluir referentes de OAuth, `sign_up` en GA4, nombres de
  eventos para Google Ads, WhatsApp de la web al número de la empresa, mandar fbp/fbc/registro_web.
- Cruce de los 16 registros de la web de septiembre: 3 Google Ads, 3 orgánico Google, 1 ChatGPT,
  1 directo, 4 con referente sucio (accounts.google.com), 3 sin rastro, 1 prueba interna.
- 18-09 17:30 — la sesión de la web terminó el cableado: atribución al crear la cuenta (perfiles
  origen: orgánico Google 7, Google Ads 3, directo 2, ChatGPT 1, referido 1, desconocido 1), eventos
  clave de GA4 `generate_lead`/`contacto_whatsapp`/`sign_up`/`submit_application`, el WhatsApp del
  sitio pasó al número de la Cloud API, y fbp/fbc/registro_web ya llegan al CRM.

## 19-09 (mañana) — Postventa cierra el caso que atendió (0258)

- Gabriela (PV2), 9:23: al «Registrar y rechazar» la garantía de BESO DE SAL (PRO-09468, el
  cliente se equivocó de máquina) el CRM le dijo «Solo el dueño de la oportunidad puede cambiarle
  la etapa». El expediente es de `postventa@` (PV), donde aterriza todo lo que Central deriva a
  postventa. La 0238 abrió la **gestión** a cualquiera del área pero la **etapa** seguía siendo del
  dueño: anotar sí, cerrar no. Medido: 180 de 244 casos abiertos de postventa son de PV; PV2
  anotó 11 gestiones en ellos desde el 15-09 sin poder cerrar ninguno.
- 0258: política `oportunidades_postventa_update` con la misma llave que la gestión
  (`puede_postventa()` + `tipo_postventa`). Probado como PV2 y PV1 (cierran), C1 (no), y PV2 sobre
  expedientes comerciales ajenos (0 filas). El dueño no cambia: «Pedir el expediente» (0202) sigue
  siendo el camino. Solo base: no requiere despliegue.

## 21-09 — Carlos revisa el CRM en vivo con Lesly, Rubí y Gabriela (0259, 0260)

Transcripciones «21-09-2026 10.06» y «21-09-2026 10.31». Todo desplegado el mismo día.

**Pedido y despacho (0259)**
- «No lleva plano» con motivo: un repuesto o accesorio (el calderín de Malvich) salta el paso.
- La apertura dice **ENTREGA A DOMICILIO / EN AGENCIA** y cuál (en Cusco hay seis). El DNI de quien
  recibe pasa a obligatorio (Lesly: la agencia lo pide).
- Emitida la apertura, cambiar dirección, quién recibe o la fecha pide el código de operaciones o
  gerencia (`candadoDeApertura` → `validar_codigo_autorizacion(…, 'operaciones')`).
- El calendario muestra el despacho desde que postventa lo programa: «programado, almacén sin
  confirmar» → «confirmado por almacén» → «Despachado» (Carlos y Rubí: «todo lo programamos
  unilateralmente; lo otro ya son confirmaciones»).
- «Marcar listo» de la prueba ya no aparece a postventa una vez pedida al almacén.
- Postventa abre el PDF del cierre («están ciegos… va a tener que ser mostrado, por lo menos en
  esta etapa»). Las cifras siguen fuera de sus pantallas; el documento firmado sí.
- La atención dice quién registró lo que reportó el cliente y cuándo (`recibido_por`).
- «Viene a la planta» también desde las listas de visitas (postventa y comercial), sin cliente aún.
- Rubí pasa a llamarse «Postventa 1».

**Agenda y reporte diario de postventa**
- «Otras gestiones de hoy» (la bitácora de Central, `bitacora_dia`) en la agenda de postventa,
  con atajos propios. Carlos: «no quiero que trabajemos con el Word».
- El reporte diario de un perfil de postventa suma (calculado en TS, la función SQL no se toca):
  sección 5 lo del circuito de hoy (despachado, atendido, visita) + la bitácora; sección 6 los
  despachos, puestas en marcha, atenciones, casos y visitas de mañana. `cargarEventosPostventa()`
  (`src/lib/agenda-postventa-datos.ts`) es la misma carga que usa el calendario.
- `scripts/_bajar-como.mjs`: baja un PDF del CRM con la sesión de cualquiera (el pantallazo no
  puede abrir PDF).

**Los equipos del pedido (0260)** — Ecolav: lavadora con serie (stock), secadora sin stock, el
cliente quiere que salga solo la lavadora.
- Tabla `pedido_equipos`: una fila por unidad vendida en el cierre, sembrada la primera vez que
  se abre el pedido (`sembrar_equipos_del_pedido`; sin cierre, una fila con el texto del pedido);
  las series ya registradas por la 0253 se enganchan.
- Postventa: «Equipos de este pedido» con serie (en stock) / «sin stock todavía», registrar la
  serie cuando llega (`registrar_serie_del_equipo` → nace en el parque) y «No va en este despacho»
  (`equipo_va_en_este_despacho`; despacho parcial).
- Almacén: prueba y sube el protocolo máquina por máquina (`almacen_probar_equipo`); cuando están
  todas las que van, el pedido queda probado y embalado (con todos los protocolos) y avisa.
- La apertura lista solo los equipos que salen, con sus series.
- Trampa encontrada: tras sembrar, la segunda consulta idéntica devolvía vacío porque Next
  memoriza los fetch iguales dentro de un render; se rompe con un filtro de más (`.gte("orden", 1)`).

**Campanita «desactualizada» (Gabriela)**: revisado. Sus avisos llegan y están leídos (todos los
de hoy, 21-09). Lo que echaba de menos era saber quién registró la atención: ya se muestra. Si
«no le llega» es el aviso del navegador, falta «Activar notificaciones» en su equipo.

**Pendiente de la reunión**: Rubí manda por correo las etapas que propone para la bandeja;
Central a veces deriva con tipo de atención equivocado (ya es editable en la atención).

## 22-09 (11:00) — Carlos revisa con Central y postventa el caso Huamán Ruiz (0267)

Transcripción «22-09-2026 11.00». El caso: INVERSIONES HUAMAN RUIZ pidió el mismo kit de
interruptor de puerta dos veces —el 19-09 y otra vez el 21-09, «por SEGUNDA VEZ» escribió C1 al
registrarlo—, las dos derivaciones fueron a Postventa 1 y quedó dos días sin respuesta.

- **Dos expedientes en vez de uno.** La 0141 dejaba a postventa fuera de la consolidación a
  propósito (un caso de postventa no se funde con una venta), pero la excepción era total:
  postventa SIEMPRE abría uno nuevo. Carlos: «ese es un error, vamos a consolidarlo». **0267**:
  un caso de postventa se suma al de postventa del mismo cliente y del mismo tipo si sigue
  abierto y se movió este mes. Parchado sobre la definición viva de `asignar_lead`.
  Los dos expedientes de Huamán Ruiz se unieron a mano (gestiones y leads al que queda, gemelo
  borrado); el expediente ahora muestra las dos solicitudes y las dos gestiones.
- **«Lo que mandé a Central» miraba 24 horas.** Brenda derivó el lunes y el martes a las 11 no
  había nada en su cuenta. Ahora mira una semana, trae hasta 30 filas y el panel se ve siempre,
  también vacío (como ya decía su propia documentación y la pantalla del comercial incumplía).
- **La alerta de Central pasa de 24 h a 4 h.** Carlos: «no días, horas; tres horas, cuatro
  exageradamente. Pero ya tenemos que darle la alerta. Nuestro trabajo como central es
  supervisar». Medido el 22-09: con 24 h había 11 contactos en alerta; con 4 h son 36.

**Lo que NO se tocó, a propósito:** las fichas del cliente. Hay tres cuentas para la misma
empresa (INVERSIONES HUAMAN RUIZ con RUC 20600852893 de C4; la misma sin RUC de C5; y RUIZ
PANGALIMA sin RUC, que es la que recibió postventa). No se pueden unir solas —nombres distintos
y sin RUC— y Carlos pidió a Gabriela el file del cliente para confirmar que es el mismo antes de
consolidar. Esa es la razón por la que postventa no vio «relacionados»: no hay nada que
relacionar mientras las fichas no compartan RUC ni teléfono.

## 22-09 (12:37) — Carlos con Lesly, Rubí y Gabriela: despachos, aperturas y el estado del pedido (0269)

Transcripciones «22-09-2026 12.37 - parte 1 de 3» y «parte 2 de 3». Aplicado el mismo día:

- **«El comercial tiene que ver una tablita del estatus del pedido»** (lo había pedido en varias
  reuniones): panel «Estado del pedido» en el expediente (`src/components/crm/estado-del-pedido.tsx`),
  solo lectura y sin montos: pasos hechos de N, qué sigue y quién, despacho programado con hora,
  puesta en marcha. La RLS `servicios_pv_comercial` (0088) ya dejaba leer; faltaba la pantalla.
- **«Solamente falta ponerle hora»**: `servicios_postventa.despacho_hora` (0269); el formulario de
  programar la pide, el calendario la usa como franja, el almacén la ve en la tarjeta y en el aviso.
- **«Necesitamos saber quién está registrando esas gestiones»**: el historial del cliente muestra
  «· C5 · Katerine Tello» al lado de cada gestión.
- Postventa intentó abrir el PDF del cierre desde la lista «Informes de cierre» del expediente y el
  botón no estaba (solo se había abierto en la ficha del pedido): ahora se ve; los montos siguen ocultos.

Lo demás de esa reunión quedó en **`docs/29-plan-reunion-22-09-postventa-y-pedidos.md`**, escrito
para que lo ejecute otra sesión: Central convierte el cierre en pedido con series; doble filtro
rojo/verde en el almacén; la derivación a postventa no abre caso suelto cuando hay pedido
(postventa clasifica); contactos que se eligen y no se tipean; RUC dentro del nombre; pendientes
por tipo en agenda y reporte; liberar Herrera/Rivera; apertura en PDF; fichas relacionadas por
apellido; menores.

## 22-09 (tarde) — ítem 1 del plan: Central ingresa las series al liberar (0270)

Ejecutado por la sesión de Sonnet sobre `docs/29-plan-reunion-22-09-postventa-y-pedidos.md`.

- Carlos: «Ahora la Central tiene que tener un paso más… para que la Central ingrese la serie del
  equipo, la descripción, suba la liquidación y dé el ok para que avance. Ese es nuestro punto de
  partida.»
- `liberar_pedido_postventa` siembra `pedido_equipos` apenas nace el servicio (0270, idempotente).
  Central puede leer la lista y registrar series igual que postventa y el almacén — nunca decide
  qué va en el despacho ni prueba nada. Parchado sobre la definición viva de las tres funciones
  (`sembrar_equipos_del_pedido`, `registrar_serie_del_equipo`, `liberar_pedido_postventa`), no
  reescrito de memoria.
- `/central/cierres`, cada cierre con servicio creado muestra `EquiposDelPedido` en el modo nuevo
  `"central"`: solo la entrada de serie. El aviso a postventa dice cuántas máquinas tienen serie y
  cuántas quedan sin stock.
- Probado con transacciones revertidas (lectura, siembra, registro de serie, re-liberación
  idempotente) y con pantallazo de `/central/cierres?ver=liberados` como `central@efameinsa.com`:
  se ve el panel «Equipos de este pedido» en cada tarjeta liberada, con «+ Registrar la serie».
  Humo de producción 38/38.

## 22-09 (tarde) — ítem 2 del plan: doble filtro rojo/verde en el despacho (sin migración)

Carlos: «Tú programas el despacho, pero de nada se va a despachar. No debería permitirte
despachar si no ha cumplido los otros pasos. Al almacén tendría que aparecerle: si hay
programación, perfecto, pero me sale con rojo, o sea que postventa no ha cumplido. Si no ha
cumplido, no puedo hacer nada.»

- `apertura_despacho_at` es la señal fiable de que postventa cumplió: el servidor ya la revalida
  contra los mismos requisitos al emitirla (`emitirAperturaDespacho` → `bloquesPedido`).
- Almacén: la tarjeta «Despacho programado» es verde (con «Estamos listos» habilitado) o roja
  (sin botón, con el detalle de qué falta) según haya o no apertura. Mismo criterio en la lista
  `/almacen/pedidos` (fila dice «postventa no ha cumplido») y en «Mi día» (nueva tarjeta «De esos,
  sin apertura», y «Despachos de hoy» distingue el caso).
- Postventa: al programar sin apertura, un aviso ámbar no bloqueante con lo que falta —«todo lo
  programamos unilateralmente» sigue valiendo, solo que ahora se sabe de una vez.
- Calendario: el evento de despacho lleva un punto rojo sin apertura, en la vista de día y en la
  grilla de mes/semana.
- Verificado en producción con dos pedidos reales: CONGELADOS Y FRESCOS SAC (sin apertura, falta
  la dirección verificada) muestra la tarjeta roja y el punto rojo en la agenda del 13 de agosto;
  CLINICA PRUEBA SAN MARTIN (con apertura) muestra la tarjeta verde con el botón activo. Humo
  38/38.

## 22-09 (tarde) — ítem 3 del plan, acotado tras revisar el código (sin migración)

Carlos, sobre Titan: «esto es una atención técnica, no es una puesta en marcha… se está
capturando un caso cuando esto es repetitivo, de despacho, en pedidos». Lesly: «yo lo tengo allí
y yo tengo que generarme el caso».

El plan original (docs/29) suponía que había que tocar `crear_atencion_al_derivar` (0132) o
`asignar_lead`. Al revisar el código antes de tocar nada se encontró que **ya existe** el
mecanismo: la 0244 (15-09) engancha sola una atención de tipo `puesta_en_marcha` al pedido vivo
del cliente sin puesta en marcha (`servicio_id`), y «Cambiar tipo» (0238, ya en pantalla) corrige
el tipo con un clic — al cambiarlo a `puesta_en_marcha` el enganche se dispara solo. El problema
real no era de datos ni de disparadores: era de **visibilidad**. Nada avisaba, cuando el enganche
automático no aplicaba (solo cubre `puesta_en_marcha`), que el cliente ya tenía pedidos sin
cerrar.

- `/postventa/atenciones/[id]`: si la atención no está enganchada a ningún pedido y el cliente
  tiene pedidos sin cerrar, un aviso ámbar los lista con enlace, recordando que cambiar el tipo a
  «Puesta en marcha» la engancha sola.
- Cero riesgo: no se tocó `asignar_lead` ni ningún disparador.
- Verificado con datos reales: 75 atenciones abiertas sin enganchar; PERUVIAN NATURE S & S (no es
  de práctica) mostró el aviso con sus 2 pedidos sin cerrar. Humo 38/38.
