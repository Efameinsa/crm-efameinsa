# 04 · Plan de implementación (para ejecutar con Sonnet)

**Restricción dura:** gerencia espera avance visible al día siguiente y piloto funcional en ~2 días. El orden de los bloques está pensado para eso: B1–B3 = piloto; B4–B5 después de mostrar el piloto.

## Estructura de carpetas objetivo

```
crm-efameinsa/
├─ CLAUDE.md                  # contexto del proyecto (leer SIEMPRE primero)
├─ docs/                      # 01 contexto · 02 modelo · 03 reglas · 04 este plan
├─ supabase/
│  ├─ migrations/0001_esquema_inicial.sql   # ya escrita
│  └─ seed.sql                              # ya escrita (completar rubros y correlativos)
├─ scripts/
│  ├─ extraer-catalogos.mjs   # genera seeds desde los Excel (ya escrito)
│  └─ indice-clientes.mjs     # B2: índice mínimo RUC/DNI+comercial para dedup día 1
├─ public/                    # logo-efameinsa.png, iconos PWA
└─ src/
   ├─ middleware.ts           # sesión Supabase + registro en `accesos`
   ├─ app/
   │  ├─ (auth)/login/
   │  ├─ (app)/               # layout con nav por rol
   │  │  ├─ central/          # bandeja, captura, triaje, asignación
   │  │  ├─ comercial/        # mi-dia/, oportunidades/[id], cotizador
   │  │  ├─ gerencia/         # dashboard-comercial, dashboard-marketing,
   │  │  │                    #   aprobaciones/, cartera-liberable/
   │  │  └─ admin/            # usuarios, productos, precios, catalogos
   │  └─ api/
   │     ├─ leads/route.ts            # POST público con token (formularios web)
   │     ├─ webhooks/meta/route.ts    # Meta Lead Ads (B5)
   │     └─ cron/
   │        ├─ gasto-diario/route.ts  # Google Ads + Meta APIs (B5)
   │        └─ alertas/route.ts       # SLA 6pm y silencios (B4)
   ├─ components/
   │  ├─ ui/                  # shadcn/ui
   │  └─ crm/                 # RegistroRapido, BuscadorDedup, SelectorProximaAccion...
   ├─ lib/
   │  ├─ supabase/{client,server,admin}.ts   # patrón @supabase/ssr
   │  ├─ acciones/            # server actions: asignarLead, guardarCotizacion, cerrarVenta...
   │  ├─ pdf/cotizacion.tsx   # @react-pdf/renderer, marca Efameinsa
   │  └─ validaciones/        # esquemas Zod
   └─ types/database.ts       # supabase gen types typescript
```

## B1 · Fundaciones (≈ medio día)
1. Scaffold: `npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"` (dentro de esta carpeta; ya hay CLAUDE.md/docs — no sobrescribir).
2. `npx shadcn@latest init` + componentes base (button, card, table, dialog, form, badge, tabs).
3. Crear proyecto Supabase (Free) desde el dashboard; guardar URL y keys en `.env.local` (ver `.env.example`).
4. Aplicar `0001_esquema_inicial.sql` y `seed.sql` (SQL Editor del dashboard o `supabase db push` si instalan la CLI).
5. `npm i @supabase/supabase-js @supabase/ssr zod` · auth con patrón @supabase/ssr (server client + middleware).
6. Crear usuarios de prueba (admin, gerencia, central, C5) desde el dashboard + filas en `perfiles`.
7. Middleware: refresca sesión, registra fila en `accesos` una vez por sesión nueva, y redirige por rol al entrar a `/`.
8. Layout `(app)` con navegación según `perfiles.rol`. Colores marca: granate `#7E1210`, carbón `#2C2E35`.

**Aceptación:** login funciona; cada rol aterriza en su home; fila en `accesos` con IP.

## B2 · Central: captura, triaje, asignación (≈ 1 día) — corazón del piloto
1. Formulario de captura rápida (canal, área destino, nombre, teléfono, RUC/DNI, mensaje). Al escribir teléfono/documento → `BuscadorDedup` consulta en vivo y muestra cuenta existente + su comercial de cartera.
2. Bandeja: tabla de leads `pendiente_triaje` con acciones: derivar a área / descartar / duplicado / asignar.
3. `asignarLead()` (server action transaccional): crea/vincula `cuenta`, abre `oportunidad` (etapa `asignada`), inserta `asignaciones` con motivo correcto (`cartera_existente` si la cuenta tenía dueño), setea `asignado_a/at/por`.
4. `scripts/indice-clientes.mjs`: lee los Excel (paquete `xlsx`, rutas `C:/...`) y genera CSV/SQL con RUC/DNI + razón social + comercial de cartera → cargar a `cuentas` (solo índice mínimo; migración completa AL FINAL).

**Aceptación:** un lead entra, se detecta duplicado real del índice, se asigna a su comercial de cartera, y C5 lo ve en su vista (y nadie más — probar RLS con dos usuarios).

## B3 · Comercial: mi día y gestión ≤15 s (≈ 1 día) — cierra el piloto
1. **Mi día:** oportunidades con `proxima_accion_at` = hoy/vencidas, leads recién asignados, cotizaciones por vencer SLA.
2. Detalle de oportunidad: datos de cuenta/contactos, historial de actividades, etapa actual.
3. `RegistroRapido`: tipo de actividad (botones), nota opcional, próxima acción + fecha (hoy/mañana/próx. semana) — objetivo ≤15 s, medirlo.
4. Cambio de etapa con validaciones (rechazo exige motivo del catálogo).
5. Filtro: checklist SUNAT/redes → etapa `filtrada`.

**Aceptación piloto (demo a gerencia):** flujo completo lead → Central → asignación → comercial registra gestión y avanza etapa. RLS verificado. Desplegado en Vercel Hobby con URL compartible.

## B4 · Cotizador con PDF (≈ 1–1.5 días)
1. Admin: alta de productos (foto a Storage) y listas de precios por tier.
2. Cotizador: seleccionar productos → precios de lista visibles → si precio ofrecido < piso → banner "requiere aprobación de gerencia" y estado `pendiente_gerencia`.
3. Bandeja de aprobaciones de gerencia (aprobar/rechazar con nota).
4. PDF con `@react-pdf/renderer`: **diseño nuevo** (gerencia pidió rediseñar), marca Efameinsa (granate/carbón, Arial/Helvetica, logo desde `public/`), fotos estandarizadas, serie y correlativo, condiciones, vigencia. Guardar en Storage, `pdf_path` en la cotización.
5. Registrar venta desde cotización aceptada (`cerrarVenta()`: crea `ventas`, etapa `venta`; el trigger actualiza `ultima_venta_at`).
6. Cron de alertas: SLA 6 pm y silencios 2/3 meses.

**Aceptación:** cotización bajo lista queda bloqueada hasta aprobación; PDF descargable con marca correcta; venta registrada alimenta `ultima_venta_at`.

## B5 · Marketing y gerencia (≈ 1.5 días)
1. `POST /api/leads` con token (`LEADS_INGEST_TOKEN`): valida con Zod, crea lead con gclid/fbclid/UTM, `fuente` derivada. Agnóstico a Astro/WordPress.
2. Webhook Meta Lead Ads (verificación + firma). **Iniciar app review (`leads_retrieval`) y solicitud de developer token de Google Ads YA — tardan semanas.**
3. Cron diario `gasto-diario`: Google Ads API + Meta Marketing API → upsert `campanias` y `gasto_campania`.
4. Dashboard gerencia — **solo 2 reportes** (regla R12): comercial y marketing (CPL/CPA/ROAS).
5. Pantalla "Cartera liberable" (`v_cuentas_liberables`) con derivación auditada.
6. PWA: manifest + iconos (instalable, "parece programa").

**Aceptación:** lead de prueba con UTM entra por API; gasto de un día en la tabla; dashboards muestran embudo y CPL reales.

## Pendientes externos (no bloquean B1–B4)
- Respuestas de gerencia: criterio EFAMEINSA vs OPEN; tier piso del vendedor; campos mínimos de Central (Santos los tiene).
- Decisión web Astro vs WordPress (sábado 2026-08-15).
- Crear repo en GitHub (sin gh CLI: crear en github.com, `git remote add origin`, push) y conectar a Vercel.
- Migración histórica completa de los Excel: AL FINAL del proyecto.
