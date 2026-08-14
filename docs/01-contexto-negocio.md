# 01 · Contexto de negocio

## La empresa

EFAMEINSA vende equipos de lavandería **industrial** y **semi-industrial** en Perú (marcas: LG, Primus, Unimac, Sailstar, ADC, Efamein, Bimap, Sidi Mondial, GMP, Girbau). Factura bajo dos razones sociales — **EFAMEINSA** y **OPEN** (Open Investments) — con series de cotización separadas. El criterio de cuál serie usar por cliente lo decide hoy el vendedor caso por caso (definición pendiente de gerencia; el sistema soporta ambas).

## Actores

| Actor | Rol en el CRM |
|---|---|
| **Central** (recepción) | Recibe TODO contacto entrante (teléfono, WhatsApp, web). ~50% no es comercial: servicio técnico, postventa, RRHH, proveedores, facturas. Registra, hace triaje por área y ejecuta la asignación que decide gerencia. |
| **Gerencia comercial** (ing. Carlos / srta. Karen) | Decide a qué comercial se asigna cada lead. Aprueba descuentos por debajo de lista. Consume el dashboard. |
| **Comerciales C1–C10** (ej. C5 Katerine Tello) | Filtran (SUNAT/redes), gestionan prospectos, cotizan, hacen seguimiento, cierran. Cada uno ve SOLO su cartera. |
| **Gerencia general (GG)** | Aprueba descuentos mayores; recibe los 2 reportes ejecutivos. |
| **Admin** | Usuarios, productos, listas de precios, catálogos. |

## Proceso actual (as-is, en Excel)

1. Lead entra por web/WhatsApp/llamada a Central → captura manual en `SEGUIMIENTO DE PROSPECTOS-2026.xls` con código `PRO-####`, vía, origen, timestamps de recepción y asignación.
2. Gerencia decide la asignación → Central anota comercial (C1–C10).
3. El comercial filtra (SUNAT, Facebook, LinkedIn), registra en su Excel personal (hoja PROSP.), y si procede pasa a COTIZ. con historial de seguimientos (filas append por evento).
4. Estados codificados tipo `P1_F_Realiz_Y_Cotizado` (P1–P3 prospecto, C1–C4 cotización) mezclan etapa + resultado + acción en un solo código.
5. Reportes manuales: agenda diaria/semanal a gerencia, consolidado de cierres, rechazados por competencia.

**Veredicto del análisis:** la lógica de negocio es sana; lo que se reingenia es la capa de registro y control — base de datos única, vistas por rol, estado separado en tres dimensiones (etapa / resultado / próxima acción + fecha), reportes y correlativos automáticos, alertas.

## Hallazgos clave

- **Central es una centralita**, no solo mesa de leads: si el CRM no registra y deriva contactos no comerciales, Central mantendrá un Excel paralelo y muere la adopción.
- **Atribución degradada:** VIA (canal de contacto) ≠ ORIGEN (fuente de marketing); el origen se pierde en ~99% de registros actuales → el CRM separa `canal_contacto`, `fuente_atribucion` (gclid/fbclid/UTM) y `area_destino`.
- Duplicados frecuentes → dedup por RUC/DNI y teléfono normalizado, con índice mínimo de clientes cargado el día 1.
- Registrar una gestión hoy cuesta minutos y disciplina → objetivo ≤15 s por gestión.

## Decisiones de gerencia (reunión 2026-08-14)

1. **Cartera:** el cliente pertenece al comercial que lo atendió antes. A los **6 meses sin venta**, el cliente es liberable y gerencia **puede** (decisión manual) derivarlo a otro comercial.
2. **Formato de cotización:** se **rediseña** dentro del proyecto (no se replica); fotos estandarizadas confirmadas.
3. **Aprobación de precios:** semi-industrial tiene lista con 3 niveles (óptimo / medio / deseado); industrial tiene lista base. El vendedor se auto-aprueba **dentro de lista**; por debajo de lista (guerra de precios local) aprueba gerencia. *Pendiente: confirmar qué nivel es el piso del vendedor.*
4. **Acceso:** deseado desde cualquier lugar (migración a laptops en curso); con contraseña y **registro de accesos** (quién/cuándo/desde dónde).
5. **Metas y bonos:** fuera del CRM (RRHH los calcula). Dashboard individual del vendedor ("me falta 10%") gustó → candidato v2.
6. **Papel:** eliminar; digitalización completa del flujo interno.
7. **Reportes de gerencia:** exactamente **2 tipos**, solo lo relevante para decidir.
8. **Presupuesto:** $20–25/mes (Supabase) aceptado; piloto gratis. HubSpot descartado por costo de implementación (~$10k + $8/usuario/mes).
9. **Plazo:** avance visible al día siguiente; **piloto funcional en ~2 días**. Mejora prometida: ~90% del tiempo de proceso.

## Definiciones aún pendientes de gerencia

- Criterio EFAMEINSA vs OPEN por cotización.
- Nivel de lista que es piso del vendedor (¿deseado?).
- Campos mínimos obligatorios de Central (Santos ya los relevó — pedírselos).
- Decisión web pública Astro vs WordPress (sábado 2026-08-15) — no bloquea: `/api/leads` es agnóstico.
