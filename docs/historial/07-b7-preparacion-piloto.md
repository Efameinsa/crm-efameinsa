# 07 · B7 — Preparación del piloto (feedback de gerencia 14-08)

Especificación de ejecución. Contexto y justificación de cada pieza: `docs/06-feedback-gerencia-2026-08-14.md`. **El piloto arranca el lunes 18-08** — este bloque es el camino crítico.

## Reglas transversales (aplican a TODO el bloque)

**UI/UX — mismo lenguaje visual en todo lo nuevo y lo retocado:**
- Reutilizar las piezas existentes: `SeccionPanel`, `EtapaBadge`, `PuntoInteres`, `Kpi`, tokens de `globals.css` (granate primario, semánticos verde `#1E7F4F` / ámbar / destructive, fondo `--app-bg`).
- Números siempre `tabular-nums` y formateados `es-PE`; fechas `toLocaleDateString("es-PE")`.
- Estados vacíos con mensaje útil + acción (nunca una tabla vacía muda).
- Animaciones con `motion`: entradas 200ms ease-out, sin rebotes, respetando `prefers-reduced-motion` (`useReducedMotion`).
- Interactivo se ve interactivo: hover con elevación/acento, focus visible.
- Texto de UI: trato de usted, "Efameinsa" con inicial mayúscula, nunca valores crudos de enum (siempre etiqueta).

**SQL — lecciones acumuladas (NO repetir bugs ya pagados):**
- Todo `CASE` de literales hacia columna enum necesita cast explícito `::tipo_enum` (bug pagado 3 veces).
- Toda migración nueva se aplica con `npm run db:migrar` (trackea aplicadas).
- Policies de RLS: verificar SIEMPRE con dos usuarios reales (que A ve lo suyo Y que B no lo ve).

**Verificación — obligatoria por pieza, como en B2–B6:**
- Probar de punta a punta con datos reales vía script (`npx tsx --env-file=.env.local`), no solo build/lint.
- Limpieza de datos de prueba SIEMPRE con `service_role` revisando `{ error, count }` de cada `.delete()` (Supabase no lanza excepción cuando RLS bloquea — bug pagado).
- NO tocar los datos que creó Darwin a mano ("Hank Prueba", "prueba contacto", "Sideral Prueba") ni las oportunidades de demo.
- Al final: `npm run build` + `npm run lint` limpios, commit por pieza y `git push` (el remoto ya está configurado: github.com/Efameinsa/crm-efameinsa; el push a producción en Vercel es automático).

---

## Pieza 1 · Migración 0011: meta mensual del comercial

```sql
alter table perfiles add column meta_mensual numeric(12,2);
```
Nullable; moneda implícita USD. Seed de arranque (en el script de cuentas de la pieza 2): 125,000 para cada comercial — placeholder hasta que gerencia entregue los rangos reales por vendedor.

## Pieza 2 · Cuentas de los comerciales C1–C4

Nuevo script permanente `scripts/crear-comerciales.mjs` (mismo patrón idempotente que `crear-usuarios-prueba.mjs`: Admin API + upsert de perfil + password impreso UNA vez, nunca guardado):

| Código | Nombre | Correo |
|---|---|---|
| C1 | Brenda | c1@efameinsa-crm.local |
| C2 | Comercial C2 | c2@efameinsa-crm.local |
| C3 | Comercial C3 | c3@efameinsa-crm.local |
| C4 | Arianna | c4@efameinsa-crm.local |

(C1 Brenda y C4 Arianna son nombres reales conocidos de la entrevista; C2/C3 genéricos hasta tener la lista de personal.) El script también setea `meta_mensual = 125000` a TODOS los comerciales (incluida C5). Estructura editable: cuando gerencia entregue nombres/correos reales, se edita el array y se re-corre.

Efecto colateral esperado y correcto: los 4 aparecen en el diálogo de asignación de Central y en la tabla "Por comercial" de gerencia (con ceros).

## Pieza 3 · Notificación a gerencia al registrar en Central

- En `src/lib/notificaciones.ts`: agregar `"lead_registrado"` al tipo `TipoNotificacion`.
- En `registrarContacto` (`src/lib/acciones/leads.ts`): tras insertar con éxito, **solo si `area_destino === "comercial"`**, llamar `notificar({ rol: "gerencia", tipo: "lead_registrado", titulo: "Nuevo contacto en Central", cuerpo: "{nombre_contacto} · {canal legible}{ · razon_social si hay}", url: "/gerencia" })`.
- Nota para B5 futuro: cuando exista `/api/leads`, ese endpoint debe disparar la misma notificación.
- Verificación: registrar lead comercial de prueba → fila en `notificaciones` visible para el usuario gerencia (y NO para C5); registrar lead de área servicio_tecnico → NO genera notificación. Limpiar con service_role.

## Pieza 4 · Buscador global de clientes para gerencia

**Ruta nueva `/gerencia/clientes`** (+ ítem "Clientes" en el nav de gerencia, icono `Building2`):
- Búsqueda server-side vía searchParams (`?q=...`): formulario GET con input (icono lupa, autofocus, placeholder "Buscar por nombre, RUC/DNI o teléfono…"). Query: `cuentas` con `or(razon_social.ilike.%q%, num_doc.ilike.%q%)` — y si `q` normalizado a dígitos tiene ≥6, buscar también en `contactos.telefono_normalizado` (dos queries y unir por id). Límite 50, mostrar "Mostrando 50 de N" si se trunca.
- Sin `q`: mostrar las 30 cuentas más recientes + el conteo total ("1,163 clientes registrados") — nunca pantalla vacía.
- Columnas: Cliente (razón social + doc pequeño debajo) · **Comercial dueño** (nombre + código — ESTE es el dato que gerencia pidió) · Zona · Oportunidades abiertas · Última venta · "Ver".
- "Ver" → `/gerencia/clientes/[id]`.

**Ficha compartida:** extraer el contenido de `/comercial/cartera/[id]` a un componente servidor reutilizable `components/crm/ficha-cuenta.tsx` que reciba `cuentaId` (y renderice TODO lo de la pieza 5). `/comercial/cartera/[id]` y `/gerencia/clientes/[id]` lo usan ambos; la versión de gerencia muestra además un badge prominente "Cartera de: {comercial}".

## Pieza 5 · Histórico por cliente (la pieza más importante para gerencia)

Todo dentro de `FichaCuenta` (aplica a comercial y gerencia):

**5a. Línea de tiempo consolidada** — reemplaza el "Historial de oportunidades" plano actual:
- Fusionar 3 fuentes en una sola cronología descendente:
  - `actividades` (de todas las oportunidades de la cuenta): icono por tipo (reutilizar el mapa de `historial-actividades.tsx`), nota completa.
  - `cotizaciones`: "Cotización Presu_X {creada/enviada/aprobada/rechazada}" con monto — icono FileText, color según estado (ámbar pendiente, verde aprobada, rojo rechazada).
  - `ventas`: "Venta cerrada — US$ X" — icono CircleCheckBig verde, visualmente destacada.
- Cada entrada: fecha (es-PE, con año SIEMPRE visible — el histórico va de 2021 en adelante), qué oportunidad (link), texto. Diseño de timeline con línea vertical y nodos de color (como `historial-actividades` pero enriquecido).
- Mostrar las 25 más recientes + botón "Ver historial completo" que expande (client component con estado local; los datos completos ya vienen del servidor si son <300, si no paginar por searchParam).
- Extraer a componente `components/crm/linea-tiempo-cuenta.tsx`.

**5b. Compras anteriores (ventas con precios)** — sección propia arriba de la timeline, solo si existen:
- Tabla: Fecha · Cotización (código + serie) · Equipos (por ítem: "2× LG TITAN MAX — US$ 3,750 c/u") · Total.
- Query: `ventas` de las oportunidades de la cuenta, join a `cotizaciones` → `cotizacion_items` → `productos`.
- Es EL dato que Carlos pidió ("le vendiste a $15,000 el año pasado") — dale jerarquía visual: total en bold, la fila más reciente primero.

**5c. Precio histórico en el cotizador:**
- En la página de detalle de oportunidad, calcular server-side un mapa `historialPrecios: Record<productoId, { precio: number; fecha: string }>` con el ÚLTIMO precio de venta de cada producto A ESA CUENTA (query: ventas de la cuenta → items).
- Pasarlo al `Cotizador`; al agregar un ítem que esté en el mapa, mostrar bajo la fila una línea informativa: "📌 Este cliente compró este equipo a US$ {precio} el {fecha}" — en **ámbar y bold si el precio histórico es MAYOR al precio que se está ofreciendo** (señal de "estás regalando margen"), gris informativo si no. No bloquea nada, solo informa.

**5d. RegistroRapido — refuerzo del hábito:** cambiar el placeholder de la nota a algo que induzca el detalle medular que pidió gerencia: "Detalle de la gestión (ej.: tiene 20 lavanderías, presupuesto US$ 100 mil, su crédito sale el 15/09)…" y subir el textarea a 3 filas. Nada más — no burocratizar el ≤15s.

## Pieza 6 · Duplicar cotización + inmutabilidad formal

**Duplicar:**
- Server action `duplicarCotizacion(cotizacionId)` en `acciones/cotizaciones.ts`: lee la cotización + items (RLS ya limita al dueño), llama al RPC `crear_cotizacion` con los mismos serie/items/condiciones/vigencia → nace como nueva con correlativo nuevo, estado borrador, y re-evalúa la aprobación (si sigue bajo lista → pendiente_gerencia de nuevo: correcto).
- UI: botón "Duplicar" (icono Copy, variante ghost) en cada fila de `ListaCotizaciones`. Toast: "Presu_{nuevo} creada como copia de Presu_{viejo}".

**Inmutabilidad (migración 0012)** — regla de gerencia: "tan pronto se sube, no se puede modificar":
- Trigger `BEFORE UPDATE OR DELETE ON cotizacion_items`: `raise exception 'Los ítems de una cotización no se modifican; duplique la cotización'` — sin excepciones para authenticated (service_role bypassa triggers de RLS pero NO triggers normales: usar `current_setting('role')`… simplificación pragmática: el trigger lanza siempre; los scripts de limpieza de pruebas deben borrar con `session_replication_role = replica` vía service_role, O el trigger permite DELETE cuando `auth.uid() is null` — elegir la primera: documentar en el script de verificación que la limpieza de items usa `admin.rpc`/SQL directo con la conexión `DATABASE_URL` que puede `set session_replication_role = replica`).
- Trigger `BEFORE UPDATE ON cotizaciones`: permitir cambios SOLO en `estado, estado_aprobacion, aprobada_por, aprobada_at, nota_gerencia, enviada_at, pdf_path, updated_at` — si `OLD` difiere de `NEW` en cualquier otra columna (serie, correlativo, codigo, totales, snapshot, condiciones, vigencia), `raise exception 'La cotización es inmutable; duplíquela para modificarla'`.
- Verificación: intentar `update cotizaciones set total=1` como C5 → excepción; aprobar/enviar/registrar venta siguen funcionando; duplicar produce nuevo correlativo.

## Pieza 7 · Visibilidad por cartera (fix de RLS — migración 0013)

Caso de la reunión: cliente reasignado de C8 a C5 → C5 debe LEER todo el historial previo de esa cuenta, sin poder editarlo.

- `oportunidades`: separar la policy `oportunidades_comercial` (hoy FOR ALL con `comercial_id = auth.uid()`) en:
  - SELECT: `comercial_id = auth.uid() OR exists(select 1 from cuentas c where c.id = cuenta_id and c.comercial_id = auth.uid())` (lo mío + todo lo de mi cartera actual).
  - INSERT/UPDATE/DELETE: solo `comercial_id = auth.uid()` (no se escribe en gestiones ajenas).
- `actividades`, `cotizaciones`, `cotizacion_items`, `ventas`: sus policies de SELECT que hoy exigen `o.comercial_id = auth.uid()` amplían con el mismo criterio de cartera. Los WRITE quedan como están.
- Verificación obligatoria con datos reales: crear cuenta con oportunidad+actividad+cotización de un comercial A (usar C1 recién creada), reasignar la cuenta a C5 (update cuentas.comercial_id vía service_role simulando la derivación), y comprobar que C5 VE oportunidad/actividades/cotización históricas pero NO puede actualizarlas ni registrar actividad en ellas; y que C1 (ya sin la cartera) deja de ver… ojo: C1 sigue siendo `comercial_id` de la oportunidad vieja → C1 la sigue viendo (correcto: es su gestión histórica). Documentar ese comportamiento.

## Pieza 8 · "Mi gestión" — dashboard del comercial con velocímetro

**Ruta nueva `/comercial/mi-gestion`** (nav: "Mi gestión", icono `Gauge`):

**El velocímetro (pieza central, hecho a mano en SVG — sin librería de charts):**
- Componente `components/crm/velocimetro.tsx` (client): arco semicircular 180°.
  - Pista de fondo: stroke gris `--secondary`, grosor ~14, extremos redondeados.
  - Arco de progreso: granate hasta 99%, verde `#1E7F4F` al llegar/superar 100% (cap visual en 100% del arco, el número puede decir 112%).
  - Centro: monto vendido del mes en grande (`text-3xl font-extrabold tabular-nums`, count-up reutilizando la lógica de `Kpi`), debajo "de US$ {meta} · {pct}%" en muted.
  - Animación: `motion` sobre `pathLength` (o stroke-dashoffset) de 0 al valor, 700ms ease-out, `useReducedMotion` → sin animación.
  - Marcas sutiles en 0 / 50 / 100%.
  - Si `meta_mensual` es null: mostrar el monto vendido sin arco de progreso + nota "Meta mensual sin definir — la asigna gerencia".
- Datos del mes en curso (desde el día 1): suma de `ventas.monto_total` de sus oportunidades.

**Alrededor del velocímetro** (grid de `Kpi` reutilizado): Ventas del mes (nº) · Cotizaciones enviadas del mes · Pipeline propio (suma monto_estimado abiertas) · Rechazadas del mes. Debajo, si hay rechazadas: motivo más frecuente del mes en una línea.

**Drill-down de gerencia:**
- La tabla "Por comercial" del panel de gerencia agrega columna "% meta" con mini-barra de progreso (div, granate/verde) y cada fila se vuelve clickeable → **`/gerencia/comerciales/[id]`** que renderiza el MISMO dashboard parametrizado (extraer el contenido de mi-gestion a `components/crm/panel-gestion-comercial.tsx` que recibe `comercialId` + nombre; `/comercial/mi-gestion` lo usa con el perfil propio).

## Pieza 9 · Respaldo de datos (exigencia de seguridad de gerencia)

Sin asumir `pg_dump` instalado (no lo está). Todo en Node con el paquete `pg` ya presente:

- **`scripts/backup-datos.mjs`**: conecta con `DATABASE_URL`, lista las tablas de `public` (information_schema), y vuelca cada una a NDJSON en `backups/{YYYY-MM-DD}/{tabla}.ndjson` + un `manifiesto.json` (fecha, conteo por tabla, versión de migración más alta aplicada). Al final comprime la carpeta a `backups/backup-{fecha}.zip` con `Compress-Archive` de PowerShell y borra la carpeta suelta. Imprime tamaño y ruta.
- **`scripts/restaurar-datos.mjs --archivo <zip>`**: descomprime, y con `session_replication_role = replica` (desactiva triggers/FK durante la carga) trunca e inserta en orden. Advertencia interactiva… no hay stdin: exigir flag `--confirmo-sobrescribir`.
- `backups/` en `.gitignore`.
- **`docs/respaldo-y-restauracion.md`**: política (diario automático + copia semanal a disco físico externo), cómo programarlo en Windows (`schtasks /create /sc daily /tn "Backup CRM Efameinsa" /tr "node --env-file=... backup-datos.mjs" /st 20:00` — comando exacto listo para pegar), y el punto clave para gerencia: **el esquema completo vive en git (migrations) → con el zip + las migraciones se reconstruye todo en CUALQUIER Postgres, sin depender de Supabase**. Ese documento responde literalmente la preocupación de Carlos.
- Verificación: correr un backup real, comprobar conteos contra la base, y probar la restauración CONTRA UNA BASE LOCAL O RAMA — **NUNCA restaurar sobre producción como prueba**. Si no hay Postgres local disponible, verificar solo backup + integridad del zip y dejar la restauración documentada como probada-en-seco.

## Orden de ejecución y commits

1. Migración 0011 + script C1–C4 + metas → commit "B7.1 metas y cuentas comerciales".
2. Pieza 3 (notificación) → commit.
3. Migración 0013 (RLS cartera) + verificación 2 usuarios → commit. *(antes que las fichas, porque la ficha compartida depende de esta visibilidad)*
4. Piezas 4+5 (buscador gerencia + ficha compartida + histórico + precio histórico) → commit.
5. Pieza 6 (duplicar + migración 0012 inmutabilidad) → commit.
6. Pieza 8 (velocímetro + drill-down) → commit.
7. Pieza 9 (backups + doc) → commit.
8. Actualizar `docs/04` (marcar B7 con el detalle real de lo hecho/cortado), build+lint, push final.

**Criterio de aceptación global:** gerencia recibe push al registrar Central; busca cualquier cliente y ve dueño + historial completo con compras y precios; C5 duplica una cotización sin poder editar la original; una cuenta reasignada muestra su pasado al nuevo dueño; "Mi gestión" muestra el velocímetro contra la meta; existe un zip de backup verificado y el documento de restauración.

## Queda explícitamente FUERA de B7 (no implementar)
Stock/ERP, envío de correos, WhatsApp a gerencia, panel de marketing (B5), carga de los Excel de los demás comerciales (bloqueado: gerencia aún no entrega la data — cuando llegue, es `scripts/indice-clientes.mjs` por comercial), lista de precios oficial (ídem), migración de cuentas de Supabase a correo corporativo (administrativo, lo gestiona Darwin/Santos).
