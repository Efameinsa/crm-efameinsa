# 03 · Reglas de negocio

Cada regla indica DÓNDE se implementa (DB / server action / cron / UI).

## R1 · Triaje de Central
Todo contacto entrante se registra como `lead` con `area_destino`. Si no es comercial → `derivado_area` y fin (queda el registro y el dato de a qué área fue). Si es comercial → sigue a dedup y asignación.
**Implementación:** UI bandeja Central + estados de `leads`.

## R2 · Deduplicación al registrar
Al capturar un lead, buscar en vivo por `num_doc` y `telefono_normalizado` contra `cuentas` y `contactos`. Si existe: mostrar la cuenta y su comercial de cartera → sugerencia automática de asignación (R3). Si el lead ya existe como lead reciente → marcar `duplicado` con `duplicado_de`.
**Implementación:** server action de búsqueda + UI de captura. Índices ya creados.

## R3 · Cartera (decisión gerencia 2026-08-14)
- El cliente pertenece al comercial que lo atendió antes (`cuentas.comercial_id`). Lead de cliente existente → se sugiere asignarlo a su dueño de cartera (`motivo = cartera_existente`).
- **6 meses sin venta** (desde `ultima_venta_at`, o `cartera_desde` si nunca compró) → la cuenta aparece en `v_cuentas_liberables`. **Gerencia decide** si deriva (nunca automático). Toda derivación queda en `asignaciones` con `motivo = liberacion_6_meses`.
**Implementación:** vista SQL + pantalla de gerencia "Cartera liberable" + insert en `asignaciones` + update de `cuentas.comercial_id`/`cartera_desde`.

## R4 · Asignación decidida por gerencia, ejecutada por Central
Central registra; gerencia (o Central por instrucción de gerencia) asigna. Siempre se audita en `asignaciones` (quién decidió, motivo). Al asignar un lead comercial: se crea/vincula `cuenta` y se abre `oportunidad` en etapa `asignada`.
**Implementación:** server action transaccional `asignarLead()`.

## R5 · Aprobación de precios (decisión gerencia 2026-08-14)
- Semi-industrial: lista 3 niveles (óptimo/medio/deseado). Industrial: lista base.
- Dentro de lista → `auto_aprobada`, el vendedor envía directo.
- Cualquier item por debajo del piso de lista → cotización `pendiente_gerencia`; gerencia aprueba o rechaza desde su bandeja; solo entonces se puede enviar.
- Constraint en DB impide `enviada`/`aceptada` sin aprobación resuelta.
**Implementación:** cálculo de `bajo_lista` en la server action de guardado + constraint DB + bandeja de aprobaciones de gerencia. ⚠️ Confirmar el tier piso.

## R6 · SLA de cotización
Lead filtrado que procede se cotiza **el mismo día** (corte 6 pm). Vencido → alerta al comercial y visibilidad en dashboard de gerencia.
**Implementación:** cron diario (Vercel Cron) + campo derivado en la vista "mi día".

## R7 · Silencio prolongado → sugerir cierre
- Prospecto sin cotizar: **2 meses** sin actividad → sugerir rechazo por silencio.
- Cotizado: **3 meses** sin actividad → ídem.
Sugerencia visible para el comercial y gerencia; el cierre es manual con motivo.
**Implementación:** `v_oportunidades_inactivas` + widget en UI.

## R8 · Correlativos
`PRO-#####` para leads (serie única, continúa la de Central); `Presu_###` por serie EFAMEINSA/OPEN para cotizaciones. Generación exclusiva en DB por trigger.
**Implementación:** hecha en migración 0001. Fijar valores iniciales en seed antes del piloto.

## R9 · Serie EFAMEINSA vs OPEN
Criterio de negocio **pendiente de gerencia**. Mientras tanto el vendedor elige la serie al crear la cotización (como hoy) y queda registrada en `cotizaciones.serie` y `ventas.serie` — el dashboard ya separa por razón social.

## R10 · Registro de accesos
Cada sesión nueva inserta fila en `accesos` (user, IP, user agent). Acceso permitido desde cualquier lugar (con contraseña); gerencia puede revisar quién entró y desde dónde.
**Implementación:** middleware de Next.js tras login/refresh de sesión.

## R11 · Velocidad de registro (adopción)
Registrar una actividad ≤15 segundos: botones de tipo + nota corta opcional + próxima acción con fechas rápidas (hoy/mañana/próx. semana). Sin esta regla el CRM muere como murieron los Excel compartidos.
**Implementación:** componente `RegistroRapido` presente en toda vista de oportunidad.

## R12 · Reportes de gerencia (exactamente dos)
1. **Comercial:** embudo por etapa y por comercial, ventas por serie (EFAMEINSA/OPEN) y segmento, cartera liberable, cotizaciones pendientes de aprobación, SLA incumplidos.
2. **Marketing:** leads por fuente/campaña, CPL, CPA, ROAS (ventas atribuidas vs `gasto_campania`).
Nada más en v1 — gerencia pidió explícitamente no ser abrumada.
**Implementación:** dos páginas bajo `/gerencia`, queries agregadas (vistas SQL si hace falta rendimiento).
