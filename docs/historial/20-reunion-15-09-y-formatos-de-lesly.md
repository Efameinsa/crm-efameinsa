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
