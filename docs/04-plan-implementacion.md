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
   ├─ proxy.ts                # sesión Supabase + redirect por rol (era middleware.ts; Next 16 lo renombró)
   ├─ app/
   │  ├─ (auth)/login/
   │  ├─ (app)/               # layout con nav por rol
   │  │  ├─ central/          # bandeja ✓, captura (stub B1 → formulario real en B2)
   │  │  ├─ comercial/        # mi-dia ✓, oportunidades ✓, cotizador (B4)
   │  │  ├─ gerencia/         # panel comercial ✓, marketing (stub), aprobaciones ✓, cartera-liberable ✓
   │  │  └─ admin/            # usuarios ✓, productos (stub B4), catalogos ✓
   │  └─ api/
   │     ├─ leads/route.ts            # POST público con token (formularios web) — B5
   │     ├─ webhooks/meta/route.ts    # Meta Lead Ads (B5)
   │     └─ cron/
   │        ├─ gasto-diario/route.ts  # Google Ads + Meta APIs (B5)
   │        └─ alertas/route.ts       # SLA 6pm y silencios (B4)
   ├─ components/
   │  ├─ ui/                  # shadcn/ui ✓
   │  └─ crm/                 # nav-lateral ✓, encabezado-usuario ✓; RegistroRapido, BuscadorDedup (B2/B3)
   ├─ lib/
   │  ├─ supabase/{client,server,admin}.ts   # patrón @supabase/ssr ✓
   │  ├─ auth.ts              # requerirPerfil / requerirRol ✓
   │  ├─ acciones/            # auth.ts ✓ (login/logout); asignarLead, guardarCotizacion, cerrarVenta (B2-B4)
   │  ├─ pdf/cotizacion.tsx   # @react-pdf/renderer, marca Efameinsa (B4)
   │  └─ validaciones/        # esquemas Zod
   └─ types/database.ts       # ✓ escrito a mano; reemplazar por `supabase gen types` cuando el proyecto esté enlazado
```

## B1 · Fundaciones — ✅ COMPLETADO (2026-08-14)
1. ~~Scaffold~~ ✓ Next.js 16 (Turbopack) + TypeScript + Tailwind v4, en `src/`.
2. ~~shadcn/ui~~ ✓ `init` + button, card, table, dialog, badge, tabs, input, label, select, textarea, dropdown-menu, sonner, separator, avatar. (`form` no se pudo instalar por el CLI en esta máquina — usar react-hook-form manual si hace falta en B2+, o reintentar `npx shadcn@latest add form`.)
3. ~~`npm i @supabase/supabase-js @supabase/ssr zod`~~ ✓
4. ~~Auth con patrón @supabase/ssr~~ ✓ `lib/supabase/{client,server,admin}.ts`, `src/proxy.ts` (refresca sesión + redirige por rol en `/` y `/login`), `lib/auth.ts` (`requerirPerfil` cacheado por request + `requerirRol` como guardia por sección en cada `(app)/<rol>/layout.tsx`).
5. ~~Registro de accesos~~ ✓ pero en la server action de login (`lib/acciones/auth.ts`), no en el proxy — más simple y confiable que instrumentar cada request; solo se inserta una fila por inicio de sesión real, con IP de `x-forwarded-for`.
6. ~~Layout `(app)` con nav por rol~~ ✓ `nav-lateral.tsx` + `encabezado-usuario.tsx` (con botón cerrar sesión), colores de marca aplicados en `globals.css` (granate `#7E1210` primario, carbón `#2C2E35`, Arial).
7. ~~Páginas placeholder por rol~~ ✓ central (bandeja con query real a `leads`), comercial (mi día + oportunidades con queries reales), gerencia (embudo, aprobaciones, cartera liberable — todas con queries reales a Supabase), admin (usuarios, catálogos).
8. `npm run build` y `npm run lint` limpios.

**Pendiente para que esto corra de verdad (requiere acceso a navegador — NO lo puede hacer un agente):**
- Crear el proyecto en supabase.com (Free tier), copiar `.env.example` a `.env.local` y completar `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
- Pegar `supabase/migrations/0001_esquema_inicial.sql` y luego `supabase/seed.sql` en el SQL Editor del dashboard (o instalar la CLI de Supabase y usar `supabase db push` si prefieren).
- Crear usuarios de prueba en Authentication → Users (uno por rol: admin, gerencia, central, y C5 comercial) y luego insertar su fila correspondiente en `perfiles` (mismo `id` que en auth.users) desde el SQL Editor.

**Aceptación (verificable en cuanto exista el proyecto Supabase):** login funciona; cada rol aterriza en su home; fila en `accesos` con IP; un comercial no puede entrar a `/gerencia` ni ver oportunidades de otro comercial (RLS + guardia de rol).

## B2 · Central: captura, triaje, asignación — ✅ COMPLETADO (2026-08-14)
1. ~~Formulario de captura rápida~~ ✓ `central/captura` (`captura-form.tsx`): canal, área destino, nombre, teléfono, RUC/DNI, razón social, correo, mensaje. Búsqueda de duplicados en vivo (debounce 400ms) vía la server action `buscarDuplicado` (`lib/acciones/leads.ts`) — muestra la cuenta existente y de quién es la cartera, y avisa si ya hay OTRO lead pendiente con el mismo teléfono/documento.
2. ~~Bandeja~~ ✓ `central/page.tsx`: lista leads `pendiente_triaje` con botones Asignar/Descartar. R1 se resolvió más simple de lo planeado: si el área destino no es `comercial`, el lead se guarda directo como `derivado_area` al capturarlo (no hace falta un botón "derivar" en la bandeja — nunca llega ahí). "Duplicado" quedó como server action (`marcarDuplicado`) sin botón dedicado en la UI todavía; agregarlo si en el piloto se ve necesario.
3. ~~`asignarLead()` transaccional~~ ✓ pero como función SQL `asignar_lead()` (`supabase/migrations/0002_asignacion_leads.sql`, `security definer`), no como lógica en la server action — así el dedup + alta/vínculo de cuenta + oportunidad + update del lead + auditoría en `asignaciones` corren en una sola transacción de Postgres, sin riesgo de quedar a medias. La server action solo hace `supabase.rpc('asignar_lead', ...)`.
4. ~~`scripts/indice-clientes.mjs`~~ ✓ y ya se corrió para C5 (Katerine Tello): **1158 cuentas reales** cargadas desde `CRM COMERCIAL5 2026-Katerine Tello.xlsx` (hoja PROSP., filtrando filas cabecera por `ITEM`), tipo_doc inferido por longitud (11=RUC, 8=DNI). Reutilizable para los demás comerciales en cuanto tengan usuario: `node --env-file=.env.local scripts/indice-clientes.mjs --archivo "<ruta.xlsx>" --comercial C1` (o el código que corresponda).
5. `scripts/aplicar-migracion.mjs` ahora lleva registro de migraciones ya aplicadas (tabla `_migraciones_aplicadas`) — se puede volver a correr `npm run db:migrar` después de agregar una migración nueva sin que falle por objetos ya existentes.

**Aceptación — verificada con datos reales (no solo simulada):** se creó un lead de prueba con el RUC de un cliente real de C5 (HOSPEDAJE LA PRINCESA E.I.R.L.); el dedup lo encontró y mostró "cartera de Katerine Tello"; `asignar_lead()` infirió correctamente `motivo='cartera_existente'`; y logueada como C5, la oportunidad aparece vía RLS. Falta la prueba manual en navegador (clicks reales) — el mecanismo de datos/backend está probado end-to-end.

## B3 · Comercial: mi día y gestión ≤15 s — ✅ COMPLETADO (2026-08-14)
1. ~~Mi día~~ ✓ `comercial/page.tsx`: oportunidades con `proxima_accion_at` ≤ hoy, MÁS las recién asignadas (etapa `asignada` sin fecha todavía) para que no se pierdan del radar. Cotizaciones por vencer SLA queda para B4 (no existen cotizaciones aún).
2. ~~Detalle de oportunidad~~ ✓ `comercial/oportunidades/[id]/page.tsx`: cuenta, contactos, historial de actividades, etapa actual.
3. ~~`RegistroRapido`~~ ✓ `components/crm/registro-rapido.tsx`: botones de tipo, nota opcional, próxima acción con atajos Hoy/Mañana/Próx. semana — un solo submit (`registrarActividad`) inserta la actividad y actualiza la próxima acción.
4. ~~Cambio de etapa con validaciones~~ ✓ `components/crm/cambiar-etapa.tsx` + `cambiarEtapa()`: rechazar exige motivo (validado en cliente Y en la base con el constraint `rechazo_con_motivo` — se probó explícitamente que sin motivo la base lo rechaza). `cotizada`/`venta` quedaron fuera de las etapas manuales a propósito: se alcanzan por el flujo de cotizador/venta (B4), no por cambio manual.
5. El checklist SUNAT/redes del plan original se simplificó a cambiar la etapa a "Filtrada (procede)" directamente — un checklist aparte no aportaba sobre lo que ya hace `CambiarEtapa`; se puede añadir si en el piloto real se pide más estructura.

**Dos bugs reales encontrados y corregidos al verificar con datos de punta a punta** (no solo compilando):
- Migración 0003: `asignar_lead()` fallaba con clientes **nuevos** (sin cuenta previa) — el `CASE` que infiere `tipo_doc` resolvía a `text` y Postgres no lo casteaba solo al enum `tipo_documento`. La prueba de B2 no lo agarró porque probó con un cliente ya existente (rama de código distinta). Con cliente nuevo fallaba siempre.
- Migración 0004: Central no podía leer `actividades` — faltaba su policy de RLS (sí estaba documentada en `docs/02-modelo-datos.md` pero no implementada en la migración 0001).

**Aceptación piloto — verificada end-to-end con las 4 cuentas reales:** lead nuevo → Central asigna (cliente nuevo, no solo existente) → comercial ve la asignación en "Mi día" → registra una gestión → cambia etapa a "filtrada" → Central ve la actividad → rechazar sin motivo queda bloqueado por la base de datos. **Pendiente:** desplegar a Vercel Hobby con URL compartible (ver sección de despliegue más abajo) y que Darwin/Santos prueben con clicks reales en el navegador.

## B4 · Cotizador con PDF — ✅ COMPLETADO (2026-08-14)
1. ~~Admin: alta de productos~~ ✓ `admin/productos` (`NuevoProductoForm` + `crearProducto()`): marca, modelo, nombre, segmento, categoría, capacidad, y precios por tier según segmento (3 para semi-industrial, 1 para industrial). **Foto a Storage: cortada del alcance** — no es core de la regla de negocio (aprobación de precios) y el bucket + UI de upload es trabajo aparte; `productos.foto_path` queda en el esquema para cuando se necesite.
2. ~~Cotizador~~ ✓ `components/crm/cotizador.tsx`, embebido en el detalle de oportunidad: elegir serie y productos, precios de lista visibles por tier, banner en rojo si el precio ofrecido queda bajo el piso (tier `deseado` en semi-industrial, `base` en industrial — ⚠️ sigue pendiente que gerencia confirme si es ese el piso real). `crear_cotizacion()` (función SQL transaccional, migración 0005/0006) calcula `bajo_lista` por ítem y deja la cotización completa en `pendiente_gerencia` si algún ítem lo está.
3. ~~Bandeja de aprobaciones~~ ✓ `gerencia/aprobaciones` con botones Aprobar/Rechazar (`aprobarCotizacion`/`rechazarCotizacion`) y enlace directo al PDF. Sin "nota" al rechazar por ahora — se puede agregar si en el piloto se pide.
4. ~~PDF~~ ✓ `src/lib/pdf/cotizacion-pdf.tsx` + `api/cotizaciones/[id]/pdf/route.tsx`: diseño nuevo con la marca (granate/carbón, Helvetica como la fuente base más cercana a Arial sin depender de un TTF en el servidor, logo, tabla de equipos, condiciones, vigencia). **Se genera al vuelo en cada request, NO se guarda en Storage** (`pdf_path` queda sin usar) — más simple para el piloto; si hace falta el PDF exacto que se envió en su momento (auditoría), ahí sí habría que persistirlo.
5. ~~Registrar venta~~ ✓ `registrar_venta()` (función SQL, migración 0005): crea `ventas`, pasa la cotización a `aceptada`, la oportunidad a etapa `venta` — el trigger de la migración 0001 actualiza `cuentas.ultima_venta_at` automáticamente (verificado).
6. **Cron de alertas: cortado del alcance por ahora.** SLA 6pm y silencios 2/3 meses ya tienen su vista SQL (`v_oportunidades_inactivas`, migración 0001) consultable manualmente; el canal de notificación (¿email? ¿WhatsApp no tiene API en v1?) no está definido, y el cron en sí solo tiene sentido una vez desplegado en Vercel. Retomar en B5 o al desplegar.

**Dos bugs reales más, mismo patrón que en B3** (un `CASE` con solo literales de texto no se castea solo al enum de la columna destino en un INSERT/UPDATE — sí funciona bien en una asignación `:=` de PL/pgSQL a una variable tipada): migración 0006 corrigió `estado_aprobacion` en `crear_cotizacion()`. Búsqueda exhaustiva confirmó que no queda ningún otro caso del mismo patrón en el esquema.

**Aceptación — verificada end-to-end (producto real con 3 tiers → cotización bajo lista → bloqueo de envío → aprobación de gerencia → envío → venta → cartera actualizada):** todo el ciclo pasó. PDF verificado visualmente (renderizado a imagen) con marca, logo y datos correctos — el logo inicialmente no cargaba (bug real: `@react-pdf/renderer` intenta hacer `fetch()` de un string que parece ruta de archivo; se resolvió pasando el logo ya leído como `Buffer`, no como ruta).

## B5 · Marketing y gerencia (≈ 1.5 días)
1. `POST /api/leads` con token (`LEADS_INGEST_TOKEN`): valida con Zod, crea lead con gclid/fbclid/UTM, `fuente` derivada. Agnóstico a Astro/WordPress.
2. Webhook Meta Lead Ads (verificación + firma). **Iniciar app review (`leads_retrieval`) y solicitud de developer token de Google Ads YA — tardan semanas.**
3. Cron diario `gasto-diario`: Google Ads API + Meta Marketing API → upsert `campanias` y `gasto_campania`.
4. Dashboard gerencia — **solo 2 reportes** (regla R12): comercial y marketing (CPL/CPA/ROAS).
5. Pantalla "Cartera liberable" (`v_cuentas_liberables`) con derivación auditada.
6. PWA: manifest + iconos (instalable, "parece programa").

**Aceptación:** lead de prueba con UTM entra por API; gasto de un día en la tabla; dashboards muestran embudo y CPL reales.

## B6 · Notificaciones push y rediseño UX — ✅ COMPLETADO (2026-08-14)
Diseñado y ejecutado el 2026-08-14 a pedido de Darwin (rechazo de cotización sin aviso al comercial + campos "intención"/"monto estimado" sin UI + vistas poco amigables). Especificación completa: `docs/05-diseno-ux-notificaciones.md`. Mockup visual aprobado por artifact "Rediseño CRM Efameinsa".

1. ~~Centro de notificaciones + Web Push~~ ✓ Migración 0008 (`notificaciones`, `push_suscripciones`, RPC `crear_notificacion` security definer, Realtime habilitado). `lib/notificaciones.ts` (`notificar()`, server-only, usa admin client — necesario porque `push_suscripciones` es privada por dueño y hay que leer las de OTRO usuario para enviarle el push) + `public/sw.js` + `lib/push-cliente.ts` (suscripción desde el navegador) + `CampanaNotificaciones` (tiempo real vía Supabase Realtime, panel con no-leídas) + `CalloutActivarNotificaciones` en Mi día. Los 4 eventos v1 quedaron conectados: `lead_asignado` (en `asignarLead`), `cotizacion_pendiente`→gerencia y `cotizacion_aprobada`/`cotizacion_rechazada`→comercial (en `crearCotizacion`/`aprobarCotizacion`/`rechazarCotizacion`).
2. ~~Card "Calificación"~~ ✓ `CalificacionOportunidad` en el detalle (interés Alta/Media/Baja con guardado optimista, monto + moneda, segmento). `PuntoInteres` reutilizable oculta "sin_definir" en toda la app (nunca texto crudo).
3. ~~Rediseño visual~~ ✓ token `--app-bg` (fondo cálido `#F3F1F0`, distinto del blanco de tarjetas), sidebar con iconos lucide + barra activa granate, Mi día agrupado (vencidas/hoy/recién asignadas) con animación de urgencia por color de borde, `Kpi` con contador animado (respeta `prefers-reduced-motion` vía `useReducedMotion` de `motion`), `BarraEtapa` animada con % de conversión entre etapas.
4. ~~Pipeline kanban~~ ✓ `PipelineKanban` con `@dnd-kit/core`: arrastrar cambia etapa (`cambiarEtapa`, optimista con rollback si falla el server); la columna "Cotizada" NO es destino de arrastre (se llega cotizando, no arrastrando — toast explicativo); soltar en la zona "Rechazar" abre diálogo de motivo obligatorio antes de aplicar el cambio. Toggle Kanban/Tabla en `VistaOportunidades`.

**Bug real encontrado y corregido:** `/sw.js` quedaba atrapado por el proxy de autenticación (redirigía a `/login`) — un service worker servido detrás de una redirección es rechazado por el navegador ("script resource is behind a redirect"). Se excluyó explícitamente del matcher de `src/proxy.ts`.

**Hallazgo importante sobre mis propias pruebas anteriores:** al verificar B6 encontré que los scripts de limpieza de datos de prueba de B2/B3/B4 usaban el rol `central` para borrar `oportunidades`/`cuentas`/`cotizaciones`/`asignaciones` — pero `central` solo tiene SELECT en esas tablas (por diseño de RLS), así que esos borrados fallaban en silencio (sin lanzar error) y quedaron huérfanos en la base. Se limpiaron manualmente con `service_role` verificando cada borrado. **Para scripts futuros: usar siempre `service_role` (o el dueño real del recurso) para limpieza de datos de prueba, y SIEMPRE revisar `{ error }` de cada `.delete()` — Supabase no lanza excepción cuando RLS bloquea silenciosamente una operación, solo afecta 0 filas.**

**Aceptación — verificada end-to-end:** `notificar()` probado directo (no solo por tipo) con los 3 casos: por `user_id` (visible solo para el dueño, RLS confirmado que otro usuario NO la ve), por `rol` (fan-out a toda gerencia), y marcar como leída. Datos de pipeline reales sembrados (5 oportunidades de clientes reales de C5 en distintas etapas, una con cotización real pendiente de aprobación) para que el kanban y el embudo de gerencia se vean poblados en la demo. Pendiente de verificación manual en navegador: el flujo de arrastrar-soltar y la recepción real de un push (requiere activar el permiso desde la UI, no se puede probar por script).

## B7 · Preparación del piloto — feedback de gerencia 14-08 — ✅ COMPLETADO (2026-08-14)
Especificación completa: `docs/07-b7-preparacion-piloto.md` (contexto/justificación de cada pieza en `docs/06-feedback-gerencia-2026-08-14.md`). El piloto arranca el lunes 18-08. Ejecutado pieza por pieza, con commit y push individual en cada una, en el orden que marca la especificación (la migración de RLS por cartera antes que las fichas de cliente, porque estas dependen de esa visibilidad).

1. ~~Metas y cuentas de comerciales~~ ✓ Migración 0011 (`perfiles.meta_mensual`) + `scripts/crear-comerciales.mjs` (idempotente, mismo patrón que `crear-usuarios-prueba.mjs`): crea C1 (Brenda) y C4 (Arianna) con nombres reales de la entrevista, C2/C3 genéricos hasta tener la lista de personal; setea el placeholder 125,000 a todos los comerciales incluida C5. Estructura editable para cuando gerencia entregue nombres/metas reales.
2. ~~Notificación a gerencia al registrar en Central~~ ✓ Nuevo tipo `lead_registrado`: `registrarContacto()` notifica al rol gerencia (canal legible + razón social si hay) solo cuando `area_destino = comercial`, antes de que Central derive — cubre con la campana/push existente lo que antes hacía un correo del ERP por cada llamada.
3. ~~RLS de visibilidad por cartera~~ ✓ Migración 0013: se separaron las policies de `oportunidades`/`actividades`/`cotizaciones`/`cotizacion_items`/`ventas` en SELECT (propio **o** cartera actual vía `cuentas.comercial_id`) vs INSERT/UPDATE/DELETE (solo lo propio, sin cambios) — así, cuando se reasigna un cliente de un comercial a otro, el nuevo dueño lee el historial previo completo sin poder escribir sobre gestiones ajenas. El comercial anterior conserva la vista de su gestión histórica (documentado como comportamiento correcto, no un bug).
4. ~~Buscador global de clientes para gerencia~~ ✓ `/gerencia/clientes`: busca por nombre, RUC/DNI o teléfono (server-side, GET con `searchParams`); sin búsqueda muestra las 30 cuentas más recientes + el total registrado. Columna "Comercial dueño" — el dato que gerencia pidió explícitamente.
5. ~~Histórico consolidado por cliente~~ ✓ Se extrajo `components/crm/ficha-cuenta.tsx` (server component compartido por `/comercial/cartera/[id]` y `/gerencia/clientes/[id]`, con badge "Cartera de: …" solo en la vista de gerencia). Incluye: línea de tiempo consolidada (`linea-tiempo-cuenta.tsx`) que fusiona actividades + cotizaciones + ventas de TODAS las oportunidades de la cuenta (no solo una) en una sola cronología, expandible más allá de las 25 más recientes; tabla "Compras anteriores" con precio por ítem; y precio histórico por producto en el cotizador (avisa en ámbar/negrita si se está cotizando bajo lo que el cliente ya pagó antes — la funcionalidad más enfatizada de la demo). Placeholder de `RegistroRapido` ajustado para inducir el detalle medular que pidió gerencia.
6. ~~Duplicar cotización + inmutabilidad formal~~ ✓ Migración 0012: triggers bloquean `UPDATE`/`DELETE` en `cotizacion_items` y cualquier cambio en `cotizaciones` fuera de las columnas de flujo (estado, aprobación, envío). **Detalle no trivial:** `crear_cotizacion()` calculaba `subtotal`/`total`/`estado_aprobacion` con un `UPDATE` posterior al `INSERT` — eso habría chocado con su propia regla de inmutabilidad recién creada. Se redefinió para calcular todo ANTES del insert (dos pasadas sobre los ítems), así la fila nace completa y ningún flujo normal vuelve a tocar esas columnas. Nuevo botón "Duplicar" (`duplicarCotizacion()`) reutiliza el mismo RPC para nacer con correlativo nuevo.
7. ~~Dashboard "Mi gestión"~~ ✓ Velocímetro semicircular hecho a mano en SVG (sin librería de charts), animado con `motion` sobre `pathLength` (respeta `useReducedMotion`), granate hasta 99% y verde al llegar/superar la meta. `components/crm/panel-gestion-comercial.tsx` compartido entre `/comercial/mi-gestion` (perfil propio) y `/gerencia/comerciales/[id]` (drill-down); la tabla "Por comercial" del panel de gerencia suma columna "% meta" con mini-barra y cada fila navega al drill-down.
8. ~~Backup y restauración~~ ✓ Sin `pg_dump` instalado: `scripts/backup-datos.mjs`/`restaurar-datos.mjs` en Node puro con `pg`, NDJSON + manifiesto, comprimido con `Compress-Archive` de PowerShell. `docs/respaldo-y-restauracion.md` documenta la política (diario + copia semanal a disco físico), el `schtasks` exacto, y el punto clave para gerencia: el esquema vive en git (migrations), así que zip + migraciones reconstruyen todo en cualquier Postgres, sin depender de Supabase.

**Cortado del alcance, tal como indicaba la especificación:** stock/ERP, envío de correos, WhatsApp a gerencia, panel de marketing (B5), carga de los Excel de los demás comerciales y lista de precios oficial (bloqueados: gerencia aún no entrega esa data), migración de cuentas de Supabase a correo corporativo (administrativo).

**Aceptación — verificada con datos reales vía script en cada pieza** (no solo build/lint): notificación de Central visible solo para gerencia; RLS de cartera probada con C1 y C5 reales (reasignación, lectura permitida, escritura bloqueada); buscador probado por los 3 criterios con una cuenta y contacto reales; timeline mezclando las 3 fuentes con el código de cotización correcto; mapa de precio histórico devolviendo el último precio pagado; inmutabilidad probada con C1 (dueño, bloqueado por trigger) y C5 (ajeno, bloqueado por RLS en silencio — 0 filas afectadas, no excepción) más el flujo enviar/aprobar/registrar venta intacto; duplicar generando correlativo nuevo; KPIs de "Mi gestión" verificados contra oportunidades/ventas/cotizaciones reales del mes; backup real corrido contra la base (22 tablas, 1,318 filas) con el zip validado (JSON íntegro, conteos exactos) — restauración real no probada por no haber Postgres local disponible en este equipo, queda documentada como "probada en seco" según el propio plan lo contempla para ese caso. **Pendiente, como en bloques anteriores: verificación manual en navegador** (clicks reales, animaciones, responsive) — no disponible en este entorno de agente.

## B8 · Historial del cliente estilo Excel — ✅ COMPLETADO (2026-08-14)
Especificación completa: `docs/08-b8-historial-cliente.md`. Tras probar B7, Darwin y los gerentes señalaron que la línea de tiempo de la ficha del cliente NO cumplía lo que gerencia pidió como "la parte medular de la gestión comercial": que cualquier vendedor (sobre todo uno al que se le reasigna un cliente) absorba TODO el contexto de la relación como lo hacía su Excel — mostraron un ejemplo real (tabla densa: fecha + nota narrativa completa + código de resultado tipo `C3_Esperar`/`C4_VENTA`). Ejecutado pieza por pieza en el orden de la spec.

1. ~~Catálogo de resultados de gestión~~ ✓ Migración 0014: `catalogo_resultados_gestion` (editable, no enum — mismo patrón que `catalogo_motivos_rechazo`, porque gerencia aún no entrega sus códigos reales) + `actividades.resultado_id`. Sembrado con 6 resultados placeholder inferidos del Excel (Esperar, Por confirmar, Cotizado, Compra a futuro, Venta, Sin interés). Panel de solo lectura agregado en `admin/catalogos`.
2. ~~Chip "¿En qué quedó?" en RegistroRapido~~ ✓ Opcional, un tap, deseleccionable — lo mismo que ya hacían a mano en el Excel. No burocratiza el flujo de ≤15 s. `registrarActividad()` acepta `resultadoId` opcional.
3. ~~Vista Tabla del historial (la pieza central)~~ ✓ Nuevo `components/crm/historial-cuenta.tsx`, ahora el contenedor de la sección "Historial del cliente" en `FichaCuenta`: toggle **Tabla / Línea de tiempo** con **Tabla como vista por defecto** (el vendedor que llega a la ficha viene con la pregunta del Excel), orden invertible (reciente primero por defecto / antiguo primero para leer la historia completa) y filtro de texto client-side sobre nota + tipo + resultado + código de cotización. La tabla es densa a propósito: fecha + nota **completa sin truncar** (`whitespace-pre-wrap`) + badge de resultado + link a la oportunidad — el equivalente vivo del Excel. `LineaTiempoCuenta` no se borró: pasó a ser el modo alternativo y perdió su estado interno de expansión/paginado (ahora lo controla `HistorialCuenta`, compartido entre ambas vistas); de regalo también muestra el resultado como badge junto a la fecha.
4. ~~Resumen del cliente~~ ✓ El acumulado narrativo de un vistazo que pedía gerencia — eso no lo resuelve un historial, lo resuelve un resumen. Usa `cuentas.notas`, columna que existe desde B1 y nunca tuvo pantalla. Nuevo `components/crm/resumen-cuenta.tsx` (panel editable arriba del historial, con estado vacío con CTA) + `actualizarResumenCuenta()` en nuevo `lib/acciones/cuentas.ts`. La RLS existente resuelve los permisos sola (dueño actual de la cartera + gerencia/admin editan; el resto solo lee) — la action revisa el `.select()` de vuelta del update porque Supabase no lanza error cuando RLS filtra en silencio (mismo bug de patrón ya pagado en B6).

**Cortado del alcance, tal como indicaba la especificación:** resumen generado con IA (v2), editar/borrar actividades históricas (append-only por diseño), importar los historiales narrativos de los Excel antiguos (bloqueado: gerencia no entrega la data), CRUD del catálogo de resultados en admin (solo lectura; los códigos reales los define gerencia y se cargan por SQL).

**Aceptación — verificada con datos reales vía script en cada pieza:** catálogo sembrado con los 6 resultados; `resultado_id` guarda correctamente con y sin selección, join al catálogo trae el nombre esperado; nota multilínea intacta de punta a punta, filtro de texto y orden ascendente/descendente replicados contra la lógica real del componente (encuentran el evento correcto y solo ese); resumen del cliente probado con C1 (dueño, escribe), C5 (no dueño, 0 filas por RLS en silencio) y gerencia (escribe) reales por impersonación. **Pendiente, como en bloques anteriores: verificación manual en navegador.**

## B9 · Feed de oportunidad y navegación de tablas — ✅ COMPLETADO (2026-08-14)
Especificación completa: `docs/09-b9-feed-oportunidad-navegacion.md`. Tras revisar B8 en producción, Darwin señaló tres problemas de UX: (1) la tabla estilo Excel de B8 vive en la ficha del cliente, pero el vendedor trabaja en el **detalle de oportunidad**, donde lo primero que veía era un formulario y el historial (al fondo) solo mostraba esa oportunidad puntual — un vendedor con cartera reasignada no veía nada del pasado; (2) el formulario de registrar gestión mostraba ~20 elementos todo el tiempo para una acción de ≤15 s, y sus chips seleccionados usaban el mismo granate sólido que el botón de acción primaria; (3) las tablas obligaban a perseguir un botón "Ver" al final de la fila, con scroll horizontal cuando la razón social era larga.

1. ~~Jerarquía de color~~ ✓ Los chips de tipo/resultado en `RegistroRapido` y el toggle Tabla/Línea de tiempo pasaron de granate sólido a `bg-primary/10 text-primary` (el estilo que ya usaba `CalificacionOportunidad`). El único granate sólido de cada vista queda reservado para su acción primaria. Grep confirmó cero chips de selección con granate sólido en `src/components/crm`.
2. ~~Detalle de oportunidad como feed~~ ✓ Se extrajo `cargarHistorialCuenta()` a `lib/historial-cuenta.ts` (compartido con `FichaCuenta`) y `/comercial/oportunidades/[id]` se reordenó: "Registrar gestión" (compacto) → **"Historial del cliente" con la historia COMPLETA de la cuenta** (todas sus oportunidades, no solo esta — con link "Ver ficha completa") → "Cotizaciones". El panel viejo de historial (solo de esta oportunidad) y `historial-actividades.tsx` se eliminaron, absorbidos por el feed de cuenta. `RegistroRapido` pasa a revelado progresivo: en reposo solo chips de tipo + nota de 1 línea; al enfocar la nota se despliegan resultado y próxima acción (con `motion`, respeta `useReducedMotion`), y solo colapsa tras registrar con éxito.
3. ~~Navegación de tablas~~ ✓ Se eliminó el botón "Ver" de `/gerencia/clientes` (nuevo `tabla-clientes.tsx`, con razón social a 2 líneas vía `line-clamp-2` en vez de estirar la tabla) y de la tabla de historial (`historial-cuenta.tsx`, ahora enlaza a la oportunidad clicando la fila): en ambas, la fila completa navega (`role="link"`, `onClick`/`onKeyDown` → `router.push`, hover/focus visibles, chevron como pista) — mismo patrón que ya existía en `tabla-por-comercial.tsx` (B7.8). De paso se corrigió "Compras anteriores" en `FichaCuenta`: la columna Equipos heredaba `whitespace-nowrap` del `TableCell` base y podía empujar la tabla con listas largas de equipos.

**Cortado del alcance, tal como indicaba la especificación:** destacar visualmente los eventos de la oportunidad actual dentro del feed, tocar el kanban/tablas de gerencia sin botón "Ver", cambios en la server action `registrarActividad`, responsive móvil a fondo.

**Aceptación — verificada con datos reales vía script en la pieza con riesgo de regresión:** una cuenta con 2 oportunidades confirmó que `cargarHistorialCuenta()` trae los eventos de AMBAS al consultar por `cuentaId` — exactamente el "vendedor reasignado ve todo el contexto" que motivó el bloque. Las piezas 1 y 3 son de UI pura: build+lint limpios y grep de consistencia (cero chips con granate sólido, cero enlaces "Ver" residuales). **Pendiente, como en bloques anteriores: verificación manual en navegador** — clic en fila, expansión del formulario al escribir, que en una laptop normal ninguna tabla muestre scroll horizontal.

## Pendientes externos (no bloquean B1–B4)
- Respuestas de gerencia: criterio EFAMEINSA vs OPEN; tier piso del vendedor; campos mínimos de Central (Santos los tiene).
- Decisión web Astro vs WordPress (sábado 2026-08-15).
- Crear repo en GitHub (sin gh CLI: crear en github.com, `git remote add origin`, push) y conectar a Vercel.
- Migración histórica completa de los Excel: AL FINAL del proyecto.

## B12 · Reportes de gerencia fiables (2026-08-18) ✓

Auditoría del flujo de información + reconstrucción de los paneles. Detalle
completo, decisiones y limitaciones en `docs/bitacora-2026-08-18-reportes-gerencia.docx`.

- **Agregación en Postgres** (`resumen_gerencia()`, `listar_clientes()`, vista
  `v_ventas_detalle`, migraciones 0020/0021). Motivo: supabase-js corta en
  1.000 filas sin avisar y `/gerencia` contaba en memoria; el panel del
  comercial hacía `.in()` con ~800 uuids (URL demasiado larga → 0 en el
  velocímetro). SECURITY DEFINER con autorización explícita: 9,6 s → 0,2 s.
- **`origen`** en oportunidades/ventas (`crm` | `historico_excel`) — filtro
  "Incluir histórico Excel" en todos los paneles.
- **`parametros.tc_usd_pen`** editable inline por gerencia; ROAS/CPA convierten
  moneda (antes dividían USD entre PEN).
- Fechas "hoy/este mes" en hora Lima (`src/lib/periodo.ts`), no UTC del servidor.
- Ventas históricas reimportadas con `fecha_venta = F_ESTADO` (la primera
  carga usó F_ACCION: 259 ventas de mes equivocado).
- Filtro compartido `FiltroPeriodo` (período/comercial/origen, router.push en
  transición), `loading.tsx` en todos los paneles, cursor de mano global.
- Clientes: paginación real (50/pág), búsqueda con retardo, filtros y orden.
- Meta Ads conectado: `scripts/sync-meta-ads.mjs` (backfill) +
  `api/cron/gasto-diario` (06:00 Lima, `vercel.json`).

Pendiente: fijar T.C. real; deduplicar 833 cuentas sin documento; migrar
Google Ads de Make al cron cuando haya credenciales; revisar metas por comercial.
