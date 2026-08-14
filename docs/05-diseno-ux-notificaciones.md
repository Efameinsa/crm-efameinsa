# 05 · Diseño: notificaciones push, calificación y rediseño UX (Bloque B6)

Especificación de diseño para ejecutar con Sonnet. Mockup visual aprobable: artifact "Rediseño CRM Efameinsa" (ver memoria del proyecto / preguntar a Darwin). Tres partes: **A** notificaciones, **B** calificación de oportunidades (intención/monto), **C** sistema visual y vistas rediseñadas.

---

## A · Notificaciones push

### Problema
Cuando gerencia rechaza (o aprueba) una cotización, el comercial no se entera salvo que entre a mirar la oportunidad. Lo mismo al asignarle un lead. Sin WhatsApp API (v2) ni correo definido, el canal debe ser propio.

### Solución: centro de notificaciones in-app + Web Push del navegador
Dos capas sobre una sola fuente de verdad:

```
evento de negocio (server action)
   └─ notificar()  ── inserta fila en `notificaciones` (RPC security definer)
        ├─ Supabase Realtime (INSERT) → campana + toast si la app está abierta
        └─ web-push a las suscripciones del destinatario → notificación del
           sistema operativo aunque la pestaña esté cerrada (service worker)
```

- **Web Push** no necesita ningún servicio externo de pago: paquete npm `web-push` + par de claves VAPID (`npx web-push generate-vapid-keys`, una sola vez). Funciona en Chrome/Edge de escritorio y Android; en iPhone requiere la PWA instalada (encaja con el plan PWA de B5). Funciona en `localhost` (contexto seguro) → demostrable sin desplegar.
- La campana es la red de seguridad: aunque el push falle o el permiso esté denegado, lo no leído espera en el panel.

### Migración 0008
```sql
create table notificaciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references perfiles (id) on delete cascade,
  tipo       text not null,          -- 'lead_asignado' | 'cotizacion_pendiente' | 'cotizacion_aprobada' | 'cotizacion_rechazada'
  titulo     text not null,
  cuerpo     text,
  url        text,                   -- destino al hacer click, ej. /comercial/oportunidades/<id>
  leida_at   timestamptz,
  created_at timestamptz not null default now()
);
create index ix_notif_usuario on notificaciones (user_id, created_at desc);
create index ix_notif_no_leidas on notificaciones (user_id) where leida_at is null;

create table push_suscripciones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references perfiles (id) on delete cascade,
  endpoint   text not null unique,
  claves     jsonb not null,         -- { p256dh, auth }
  user_agent text,
  created_at timestamptz not null default now()
);
```
RLS: en `notificaciones`, select/update (solo marcar `leida_at`) del propio usuario; el insert SOLO vía RPC `crear_notificacion(p_user_id, p_tipo, p_titulo, p_cuerpo, p_url)` security definer (nadie fabrica notificaciones a nombre de otro por la API pública). En `push_suscripciones`: todo del propio usuario. Además: `alter publication supabase_realtime add table notificaciones;`.

⚠️ Recordar el patrón de bugs del proyecto: cualquier `CASE` de literales hacia columna enum necesita cast explícito (aquí `tipo` es text a propósito — extensible sin migración).

### Capa de aplicación
- `src/lib/notificaciones.ts` (server): `notificar({ paraUserId | paraRol, tipo, titulo, cuerpo, url })` → inserta vía RPC por cada destinatario (rol → query a `perfiles`) y envía web-push a todas sus suscripciones. **Best-effort**: un fallo de push jamás rompe la acción de negocio (try/catch + log). Respuestas 404/410 → borrar esa suscripción (dispositivo dado de baja).
- `public/sw.js`: eventos `push` (→ `showNotification(titulo, { body, data: { url } })`) y `notificationclick` (→ enfocar pestaña existente o abrir `url`).
- Hook `useNotificaciones`: canal Realtime `postgres_changes` INSERT filtrado `user_id=eq.<uid>` → toast sonner + refrescar contador.
- `CampanaNotificaciones` en el encabezado: badge granate con nº de no leídas, panel dropdown (últimas ~15, no leídas con punto), click = marcar leída + navegar a `url`, acción "Marcar todas como leídas".
- Activación del permiso: **nunca pedirlo solo**. Callout descartable en "Mi día": "Reciba avisos de asignaciones y aprobaciones en este equipo" + botón → `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → guardar en `push_suscripciones`.
- ENV nuevos (añadir a `.env.example`): `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:).

### Matriz de eventos v1
| Evento | Dónde se dispara | Destinatario | Contenido |
|---|---|---|---|
| `lead_asignado` | server action `asignarLead` (tras el RPC) | el comercial asignado | "Nuevo contacto asignado: {razón social}" → url de la oportunidad |
| `cotizacion_pendiente` | `crearCotizacion` cuando queda `pendiente_gerencia` | todos los perfiles rol `gerencia` | "{codigo} de {comercial} requiere aprobación ({total})" → /gerencia/aprobaciones |
| `cotizacion_aprobada` | `aprobarCotizacion` | comercial dueño | "{codigo} aprobada" + nota si la hay → url oportunidad |
| `cotizacion_rechazada` | `rechazarCotizacion` | comercial dueño | "{codigo} rechazada: {nota_gerencia}" → url oportunidad |

Futuro (cuando exista cron en Vercel): SLA 6pm y silencios 2/3 meses usan el mismo canal.

---

## B · Calificación de la oportunidad (intención / monto estimado)

### Problema
`intencion` y `monto_estimado` existen en el esquema (vienen del Excel: columna `INT_COMPRA` = interés de compra Alta/Media/Baja) pero **ninguna pantalla los edita** → todo aparece "sin_definir" y "—", y el término "intención" a secas no se entiende.

### Solución
1. **Renombrar en toda la UI**: "Interés de compra" (valores Alta / Media / Baja). El valor `sin_definir` NUNCA se muestra como texto crudo: se pinta "Sin calificar" en gris sutil.
2. **Nueva card "Calificación"** en el detalle de oportunidad (columna derecha, encima de Etapa):
   - Interés: control segmentado de 3 botones con color — Alta (granate, icono llama), Media (ámbar), Baja (gris).
   - Monto estimado: input numérico + selector de moneda (USD/PEN), `tabular-nums`.
   - Segmento: Industrial / Semi-industrial (2 botones).
   - Guardado optimista al hacer click/blur (server action `calificarOportunidad`), sin botón "Guardar" aparte — mismo espíritu ≤15 s.
3. **En las listas** (Mi día, Mis oportunidades, kanban): el interés se muestra como punto/llama de color (leyenda por color, no por palabra), monto con `tabular-nums` alineado a la derecha, "—" si vacío.
4. El registro rápido de gestión puede opcionalmente sugerir calificar si sigue "Sin calificar" tras la actividad (banner sutil, no bloqueo).

---

## C · Sistema visual y vistas rediseñadas

### Tokens (se agregan a los existentes en `globals.css` — no se cambia la marca)
- Fondo de aplicación: `#F3F1F0` (gris cálido sesgado al granate — hoy `secondary/40`); superficies blancas con **2 niveles de sombra** (`0 1px 2px rgb(44 46 53 / .06)` y `0 4px 16px rgb(44 46 53 / .10)` en hover/elevación).
- Semánticos (independientes del granate de marca): éxito `#1E7F4F`, alerta `#B7791F`, crítico ya existe `#B3261E`.
- Radius: mantener `--radius` actual. Tipografía: Arial (decisión vigente), títulos de página 22–24px bold, eyebrows 11px uppercase con letter-spacing.

### Movimiento (instalar `motion`)
- Entradas de listas/cards: fade + 8px up, 200ms ease-out, stagger 30ms.
- Números de KPI: count-up 600ms al montar.
- Barras del embudo: crecen de 0 al ancho final, 500ms ease-out.
- Panel de notificaciones y sheets: slide 200ms. Toasts ya con sonner.
- **Regla dura**: nada de bounce; y TODO respeta `prefers-reduced-motion` (media query + `useReducedMotion` de motion).
- Skeletons (shadcn `skeleton`) en toda carga; empty states con icono + acción ("Bandeja vacía → Registrar contacto").

### Navegación
- Sidebar: icono lucide por ítem (Inbox, ClipboardList, CalendarCheck, KanbanSquare, BarChart3, CheckCircle2, Users, Package…), ítem activo con barra granate de 3px a la izquierda + fondo sutil, transición 150ms.
- Encabezado: título de sección + fecha, campana de notificaciones, usuario. (El buscador global queda para v2.)

### Vista 1 — "Mi día" (comercial)
Agrupada por urgencia, no lista plana:
1. **Vencidas** — franja izquierda crítica, arriba siempre.
2. **Para hoy** — franja granate.
3. **Recién asignadas** (sin primera gestión) — franja ámbar + badge "Nuevo".
Cada fila: cuenta, interés (punto de color), próxima acción, días sin actividad, y botón "Registrar gestión" que abre el RegistroRapido en un **sheet lateral** sin salir de la página (más rápido que navegar al detalle). Callout de activación de notificaciones descartable arriba.

### Vista 2 — Pipeline kanban (Mis oportunidades)
- Columnas: Asignada → Filtrada → Cotizada → Seguimiento → Potencial. Cerradas (venta/rechazada/derivada) colapsadas en un contador con filtro.
- Tarjeta: razón social, interés, monto estimado, días sin actividad (gris → ámbar ≥7 → crítico ≥14), badge "Cotización pendiente de gerencia" cuando aplique.
- **Drag & drop** con `@dnd-kit/core`: soltar en otra columna = `cambiarEtapa` (optimista + rollback si falla); soltar en "Rechazada" abre el diálogo de motivo obligatorio (regla existente intacta — `cotizada`/`venta` NO son destinos manuales, se alcanzan por cotizador/venta).
- Toggle Kanban/Tabla (la tabla actual se conserva); encabezado de columna con conteo y suma de montos.

### Vista 3 — Embudo de gerencia
Reemplaza la grilla de cards por dos niveles:
1. **Fila de 4 KPIs** (cards compactas, número grande count-up, subtítulo): Leads sin asignar · Cotizaciones por aprobar (click → /gerencia/aprobaciones) · Ventas del mes (monto) · Pipeline estimado (suma `monto_estimado` abiertas).
2. **Embudo horizontal**: una barra por etapa (Asignada→Filtrada→Cotizada→Seguimiento→Potencial→Venta), ancho proporcional al conteo, granate degradando en opacidad, conteo dentro y **% de conversión respecto a la etapa anterior** entre filas ("64% pasa a filtrada"). Es más legible que un trapecio SVG y no requiere librería de charts (divs + motion). Debajo: tabla compacta por comercial (oportunidades abiertas, cotizado, vendido).
Rechazadas: chip aparte con total y motivo principal (no es parte del embudo).

---

## Plan B6 para Sonnet (orden de ejecución)

1. **Migración 0008** (notificaciones + push_suscripciones + RPC + realtime) → `npm run db:migrar`.
2. `npm i web-push motion @dnd-kit/core` (+ `@types/web-push` dev). Generar claves VAPID → `.env.local` y `.env.example`.
3. `lib/notificaciones.ts` + `public/sw.js` + registro del SW + hook realtime + `CampanaNotificaciones` en encabezado + callout de permiso en Mi día.
4. Integrar los 4 eventos en las server actions existentes.
5. Card "Calificación" + server action `calificarOportunidad` + renombrar "Interés de compra" y ocultar `sin_definir` en todas las listas.
6. Tokens/sombras/fondo + sidebar con iconos + encabezado nuevo.
7. Mi día agrupado con sheet de gestión rápida.
8. Kanban con dnd-kit + toggle tabla.
9. Embudo + KPIs de gerencia.
10. **Verificación end-to-end con datos reales como en B2–B4** (obligatorio: rechazo de cotización genera notificación visible en campana de C5 + push; drag a rechazada exige motivo; RLS de notificaciones probada con dos usuarios).

**Criterio de aceptación global:** gerencia rechaza con nota → C5 recibe push del navegador (o toast si está dentro) y ve la notificación en la campana; el pipeline se opera arrastrando; el embudo muestra conversión real por etapa; ninguna pantalla muestra "sin_definir".
