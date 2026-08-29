# 08 · B8 — Historial del cliente estilo Excel (vista del vendedor)

Especificación de ejecución. Contexto: tras probar B7, Darwin y los gerentes señalaron que la línea de tiempo de la ficha del cliente **no** cumple lo que pidió gerencia como "la parte medular de la gestión comercial": que cualquier vendedor (especialmente uno al que se le reasigna el cliente) pueda absorber TODO el contexto de la relación como lo hacía el Excel. Referencia visual: `C:\Users\diseno\Downloads\PROYECTO CRM EFAMEINSA\ejemplo.jpeg` — una tabla densa con Fecha | Nota narrativa completa | Código de resultado (`C3_Esperar`, `C1_PTO_Conf`, `C4_VENTA`, `C4_Rdo_FUTURO`, `P1_F_Realiz_Y_Cotizado`).

**Qué hace valioso ese Excel (y qué le falta a nuestra timeline):**
1. **Densidad**: ~10 gestiones por pantalla con la nota completa. Nuestra timeline con iconos y aire muestra 4–5. Para leer 3 años de relación en 2 minutos, la densidad ES la funcionalidad.
2. **Resultado por fila**: cada gestión registra en qué quedó el cliente — responde "¿en qué quedamos?" sin leer la nota. Hoy `actividades` no captura eso.
3. **Lectura tipo historia**: orden cronológico configurable.
4. **Contexto de un vistazo**: el acumulado narrativo. Eso no lo da un historial, lo da un resumen — y `cuentas.notas` existe en el esquema desde B1 y ninguna pantalla lo usa.

**Reglas transversales: las mismas de `docs/07-b7-preparacion-piloto.md`** (UI/UX con las piezas existentes, es-PE, tabular-nums, estados vacíos útiles, motion con `useReducedMotion`; SQL con casts explícitos a enum, `npm run db:migrar`, RLS verificada con dos usuarios; verificación por pieza con datos reales vía script, limpieza con service_role revisando `{ error }`, NO tocar los datos manuales de Darwin; build+lint limpios, commit y push por pieza). Recordatorio clave de B7.6: si un script de verificación necesita borrar `cotizacion_items`, debe hacerlo por conexión `pg` directa con `set session_replication_role = replica` (el trigger de inmutabilidad bloquea el DELETE normal incluso para service_role).

---

## Pieza 1 · Migración 0014: catálogo de resultados de gestión

Sigue el patrón de `catalogo_motivos_rechazo` (serial + nombre + activo), NO un enum — gerencia todavía no entrega su lista real de códigos C1–C4/P1, así que debe ser editable sin migración:

```sql
create table catalogo_resultados_gestion (
  id     serial primary key,
  codigo text not null unique,   -- corto, estilo Excel: 'ESPERAR'
  nombre text not null,          -- etiqueta legible: 'Esperar'
  activo boolean not null default true
);

alter table actividades add column resultado_id integer references catalogo_resultados_gestion (id);
```

- Seed (dentro de la misma migración, `on conflict (codigo) do nothing`), inferido del ejemplo del Excel — placeholders hasta que gerencia confirme los códigos reales:

| codigo | nombre |
|---|---|
| ESPERAR | Esperar |
| POR_CONFIRMAR | Por confirmar |
| COTIZADO | Cotizado |
| FUTURO | Compra a futuro |
| VENTA | Venta |
| SIN_INTERES | Sin interés |

- RLS: `select` para authenticated + escritura solo backoffice (copiar el patrón de `motivos_select`/`motivos_write` de la migración 0001).
- `admin/catalogos/page.tsx`: agregar tercer panel "Resultados de gestión" (mismo formato de tabla de solo lectura que los otros dos; el grid pasa a `md:grid-cols-3` o queda en 2 columnas con wrap — lo que se vea mejor).
- Aplicar con `npm run db:migrar` y verificar por script que el catálogo quedó sembrado.

## Pieza 2 · RegistroRapido: chip opcional "¿En qué quedó?"

El flujo de ≤15 s NO se burocratiza: es un chip opcional de un tap, igual que los códigos que ya usaban en el Excel.

- En `components/crm/registro-rapido.tsx`: debajo del textarea de nota, fila de chips con los resultados activos del catálogo (mismo estilo visual que los chips de tipo). **Selección única, opcional y deseleccionable** (tap sobre el chip activo lo quita). Etiqueta pequeña arriba: "¿En qué quedó? (opcional)".
- La página de detalle de oportunidad ya carga `catalogo_motivos_rechazo`; agregar la carga de `catalogo_resultados_gestion` (activos, orden por id — el orden del seed es el orden lógico de embudo) y pasarla como prop `resultados` a `RegistroRapido`.
- `registrarActividad()` en `lib/acciones/oportunidades.ts`: nuevo campo opcional `resultadoId: number | null`, incluido en el insert de `actividades`.
- Verificación: insertar actividad con y sin resultado vía la lógica de la action (script con datos reales, cuenta VERIF propia), confirmar el join al catálogo, limpiar.

## Pieza 3 · Vista "Tabla" del historial en la ficha del cliente (la pieza central)

**Nuevo componente cliente `components/crm/historial-cuenta.tsx`** que reemplaza el uso directo de `LineaTiempoCuenta` dentro de `FichaCuenta` (la timeline NO se borra — pasa a ser el modo alternativo):

- **Toggle "Tabla / Línea de tiempo"** — **Tabla es el modo por defecto**: el que entra a la ficha viene con la pregunta del Excel ("cuéntame la historia de este cliente").
- **Selector de orden**: "Reciente primero" (default) / "Antiguo primero". Default descendente por el uso diario (¿qué pasó ayer?); el vendedor reemplazo que quiere leer la historia completa lo invierte con un click. Decisión de piloto, fácil de voltear si gerencia opina distinto.
- **Filtro de texto** (input con lupa, placeholder "Buscar en el historial…"): filtra client-side sobre nota, etiqueta de tipo, código/nombre de resultado y código de cotización. Con filtro activo mostrar "Mostrando N de M". Los datos ya llegan del servidor (límite 300 de B7) — no hay round-trip.
- **La tabla** (denso, estilo Excel — esta es LA exigencia):
  - Columnas: **Fecha** (dd/mm/yyyy, `tabular-nums`, `whitespace-nowrap`, año SIEMPRE) · **Gestión** (etiqueta de tipo en `font-semibold` + nota COMPLETA debajo, `text-sm`, `whitespace-pre-wrap`, **sin truncar jamás**) · **Resultado** (badge) · enlace "Ver" a la oportunidad (discreto, `text-xs`).
  - Filas compactas: `py-2`, sin iconos circulares, borde inferior sutil. Objetivo: ~8–10 gestiones con nota real por pantalla.
  - Eventos de cotización: en Gestión "Cotización Presu_X" + monto; en Resultado su estado con el color ya definido en B7 (ámbar pendiente / verde enviada-aceptada / rojo rechazada).
  - Eventos de venta: "Venta cerrada — US$ X" destacada (verde `#1E7F4F`, `font-semibold`); Resultado: badge "Venta" verde.
  - Actividades sin resultado: "—" en muted (serán la mayoría al inicio; no castigar visualmente).
  - Mantener el botón "Ver historial completo" si hay más de 25 (mismo comportamiento de expansión que la timeline).
- **Tipos**: extender `EventoActividad` en `linea-tiempo-cuenta.tsx` con `resultado: { codigo: string; nombre: string } | null`; `FichaCuenta` agrega el join `catalogo_resultados_gestion(codigo, nombre)` al select de actividades y lo mapea al construir eventos. La timeline puede mostrar el resultado como badge pequeño junto a la fecha (mejora gratis).
- Verificación con datos reales: cuenta VERIF con actividades (con/sin resultado, notas largas multilínea), cotización y venta → confirmar orden asc/desc, filtro (un término que matchea 1 evento), y que la nota multilínea se muestra completa. Limpiar (ojo: items → `session_replication_role = replica`).

## Pieza 4 · "Resumen del cliente" fijado en la ficha (usa `cuentas.notas`)

El acumulado narrativo de un vistazo — lo que ningún historial resuelve:

- **Nuevo `components/crm/resumen-cuenta.tsx`** (cliente): panel `SeccionPanel` titulado "Resumen del cliente", ubicado en `FichaCuenta` **arriba del historial** (primera sección de la columna principal, antes de "Compras anteriores").
  - Modo lectura: texto con `whitespace-pre-wrap`, `text-sm`. Botón "Editar" (icono `Pencil`, ghost) en la esquina del panel (prop `accion` de `SeccionPanel`).
  - Estado vacío útil: "Sin resumen todavía. Anote el contexto clave del cliente: cuántos locales tiene, presupuesto, quién decide, fechas importantes…" + botón "Agregar resumen".
  - Modo edición: textarea (6 filas) + Guardar/Cancelar, toast al guardar, guardado con `useTransition`.
- **Server action `actualizarResumenCuenta(cuentaId, notas)`** en nuevo `lib/acciones/cuentas.ts`: update de `cuentas.notas` con el client normal (NO admin) — la RLS ya hace el trabajo: `cuentas_comercial` (FOR ALL, `comercial_id = auth.uid()`) permite editar solo al dueño actual de la cartera, y `cuentas_backoffice` a gerencia/admin. Un comercial que perdió la cartera lo LEE (la ficha se lo muestra) pero no lo edita — exactamente la semántica de B7.7. Si el update afecta 0 filas por RLS, devolver error legible ("Solo el dueño actual de la cartera puede editar el resumen"): usar `.select("id")` tras el update y revisar si vino vacío, porque Supabase NO lanza error cuando RLS filtra (bug pagado en B6).
  - `revalidatePath` de `/comercial/cartera/[id]` y `/gerencia/clientes/[id]`.
- Verificación RLS obligatoria con dos usuarios reales (patrón `comoUsuario` con pg directo de B7): C1 dueña edita OK; C5 no-dueño → 0 filas y error legible; gerencia edita OK. Limpiar.

## Orden de ejecución y commits

1. Pieza 1 (migración 0014 + catálogo en admin) → commit "B8.1 catalogo de resultados de gestion".
2. Pieza 2 (chip en RegistroRapido) → commit.
3. Pieza 3 (vista tabla + filtro + orden) → commit. *(depende del resultado_id de las piezas 1–2)*
4. Pieza 4 (resumen del cliente) → commit.
5. Actualizar `docs/04` (sección B8 con el detalle real), build+lint, push final.

**Criterio de aceptación global:** un vendedor que recibe un cliente reasignado abre la ficha y ve: el resumen narrativo arriba, y una tabla densa estilo Excel con fecha + nota completa + resultado por gestión, ordenable cronológicamente y filtrable por texto — el equivalente vivo de la hoja que mostró gerencia. Registrar el resultado toma un tap opcional y no rompe el flujo de ≤15 s.

## Queda explícitamente FUERA de B8 (no implementar)
- Resumen generado con IA (v2; el manual con `cuentas.notas` valida el hábito primero).
- Editar o borrar actividades históricas (append-only por diseño).
- Importar los historiales narrativos de los Excel antiguos (bloqueado: gerencia no entrega la data; cuando llegue será parte de la migración histórica).
- Cambiar `historial-actividades.tsx` del detalle de oportunidad (esa vista responde otra pregunta y funciona bien).
- CRUD del catálogo en admin (solo lectura por ahora; los códigos reales los define gerencia y se cargan por SQL/seed).
