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
