# 09 · B9 — Detalle de oportunidad como feed + navegación de tablas

Especificación de ejecución. Contexto: tras revisar B8 en producción, Darwin detectó tres problemas de UX en la vista del comercial:

1. **El detalle de oportunidad no responde lo que pidió gerencia.** La tabla estilo Excel de B8 vive en la ficha del cliente (`/comercial/cartera/[id]`), pero el vendedor trabaja en el **detalle de oportunidad** (`/comercial/oportunidades/[id]`) — y ahí lo primero que ve es un formulario, el historial está al fondo, y encima solo muestra las actividades de ESA oportunidad, no la historia completa del cliente. Un vendedor con cartera reasignada abre la oportunidad y no ve nada del pasado. La jerarquía correcta es **contexto primero, captura segundo**.
2. **El formulario de registrar gestión abruma**: ~20 elementos interactivos visibles todo el tiempo (8 pills de tipo + textarea + 6 pills de resultado + próxima acción + fecha + 3 atajos + botón) para una acción de ≤15 s. Y las pills seleccionadas usan granate SÓLIDO (`bg-primary`), idéntico al botón "Registrar gestión" — un estado de selección no puede pesar lo mismo que la única acción primaria de la vista.
3. **Las tablas obligan a perseguir un botón "Ver"** al final de la fila (con scroll horizontal incluido cuando la razón social es larga). La fila entera debe ser el objetivo de clic — y la app YA tiene el patrón correcto en `tabla-por-comercial.tsx` (B7.8): `role="link"`, `cursor-pointer`, hover, `router.push`. Es inconsistencia: una tabla lo hace bien y las demás no.

**Reglas transversales: las mismas de `docs/07-b7-preparacion-piloto.md`** (UI/UX con piezas existentes, es-PE, tabular-nums, estados vacíos útiles, motion con `useReducedMotion`; verificación por pieza con datos reales vía script donde aplique, limpieza con service_role revisando `{ error }`, NO tocar los datos manuales de Darwin; build+lint limpios, commit y push por pieza). Recordatorio de B7.6: limpiar `cotizacion_items` requiere conexión `pg` directa con `set session_replication_role = replica`.

---

## Pieza 1 · Jerarquía de color: selección ≠ acción primaria

Regla: **una sola acción primaria por vista con granate sólido**; todo estado de selección va atenuado. El precedente correcto ya existe en `calificacion-oportunidad.tsx` (Interés Alta/Media/Baja): seleccionado = `border-primary bg-primary/10 text-primary`.

- En `registro-rapido.tsx`: los chips de **tipo** y de **resultado** seleccionados cambian de `border-primary bg-primary text-primary-foreground` → `border-primary bg-primary/10 text-primary`. El único granate sólido del panel queda en el botón "Registrar gestión".
- Barrido de consistencia: `grep` de `bg-primary text-primary-foreground` en `src/components/crm/` — donde sea un **estado de selección** (no un botón de acción), aplicar el mismo estilo atenuado. Ojo: el toggle Tabla/Línea de tiempo de `historial-cuenta.tsx` usa ese estilo como selección; cambiarlo también (los toggles de vista son selección, no acción). Los botones reales (`Button` de shadcn variante default) NO se tocan.
- Verificación: visual por build (no hay lógica); confirmar con grep que no queda ningún chip seleccionable con granate sólido.

## Pieza 2 · Detalle de oportunidad como feed (contexto primero, captura segundo)

### 2a. Extraer la carga del historial de cuenta a un helper compartido

`FichaCuenta` construye los eventos (actividades + cotizaciones + ventas de TODAS las oportunidades de la cuenta) y las compras con detalle. Esa lógica ahora se necesita en dos pantallas:

- Nuevo **`src/lib/historial-cuenta.ts`** (server-only, NO "use server" — es un helper, no una action): exporta `async function cargarHistorialCuenta(supabase, cuentaId)` que devuelve `{ eventos: EventoTimeline[], ventasConDetalle: VentaConDetalle[] }`. Mover ahí tal cual: la query de oportunidades de la cuenta, las 3 queries (actividades con join a `catalogo_resultados_gestion`, cotizaciones, ventas con items), `etiquetaCotizacion()`, el mapeo a eventos y el sort descendente. Exportar también el tipo `VentaConDetalle`.
- `FichaCuenta` pasa a llamar al helper (mismo render, menos código).

### 2b. Reordenar el detalle de oportunidad

En `/comercial/oportunidades/[id]/page.tsx`, la columna principal (2/3) queda en este orden:

1. **"Registrar gestión"** (RegistroRapido compacto — ver 2c). Sigue primero porque es la acción más frecuente, pero tras 2c ocupa ~2 renglones en reposo, así que el historial queda visible sin scroll.
2. **"Historial del cliente"** (nuevo): `<HistorialCuenta eventos={...} />` con los eventos de TODA la cuenta vía `cargarHistorialCuenta()` (la cuenta ya se conoce: `oportunidad.cuentas.id`). En el header del `SeccionPanel`, prop `accion` con link "Ver ficha completa →" hacia `/comercial/cartera/[cuentaId]`. Si la oportunidad no tiene cuenta (defensivo), no renderizar el panel.
3. **"Cotizaciones"** (igual que hoy, baja un puesto).
4. El panel **"Historial"** actual (`HistorialActividades`, solo de esta oportunidad) se ELIMINA — lo absorbe el feed de cuenta, que incluye esas mismas actividades. Borrar también `components/crm/historial-actividades.tsx` si queda sin usos (verificar con grep; los mapas de icono/etiqueta ya viven en `linea-tiempo-cuenta.tsx`).

La RLS de B7.7 ya garantiza que el comercial ve el historial completo de su cartera aunque las gestiones sean de otro comercial — no hay que tocar nada de datos.

### 2c. RegistroRapido con revelado progresivo

El formulario empieza pequeño y se despliega al usarlo. Sin cambiar la server action (ya quedó bien en B8.2):

- **En reposo**: chips de tipo (siempre visibles — son el hábito del primer tap) + textarea de **1 fila** con el placeholder actual. Nada más: sin resultado, sin próxima acción, sin botón.
- **Expandido** (estado `expandido`, se activa `onFocus` del textarea y NO se colapsa solo — se colapsa únicamente tras registrar con éxito, vía `limpiar()`): el textarea pasa a 3 filas, y aparecen "¿En qué quedó? (opcional)", el bloque de próxima acción con fecha y atajos, y el botón "Registrar gestión". La aparición con `motion` (altura/opacidad, 200ms ease-out, `useReducedMotion` → sin animación).
- Detalle importante: si el usuario ya escribió algo o eligió resultado y hace clic fuera, NO colapsar (perdería la vista de lo que lleva) — por eso el colapso es solo al registrar.

## Pieza 3 · Navegación de tablas: la fila es el botón

Patrón único en toda la app, copiado de `tabla-por-comercial.tsx`: fila con `role="link"`, `tabIndex={0}`, `onClick`/`onKeyDown` (Enter) → `router.push`, clases `cursor-pointer hover:bg-accent focus-visible:bg-accent focus-visible:outline-none transition-colors`. Como pista visual, última columna angosta con `ChevronRight` (`size-4 text-muted-foreground`).

### 3a. `/gerencia/clientes`

- La tabla se extrae a un componente cliente **`components/crm/tabla-clientes.tsx`** (la página es server component y las filas necesitan `useRouter`). Recibe las filas ya armadas (incluido el conteo de abiertas) como props serializables.
- **Fuera la columna "Ver"** → fila completa navega a `/gerencia/clientes/[id]`. Chevron al final.
- **Razón social sin scroll horizontal**: `line-clamp-2` + `title={razon_social}` (nombre completo al pasar el mouse) y un ancho máximo razonable en esa celda (ej. `max-w-[320px]`). El doc pequeño debajo se mantiene.

### 3b. Tabla del historial (`historial-cuenta.tsx`)

- **Fuera la columna/link "Ver"** → la fila completa navega a `/comercial/oportunidades/[oportunidadId]` (el componente ya es cliente; agregar `useRouter`). Chevron al final.
- **Cero scroll horizontal en laptop**: anchos explícitos y contenidos que envuelven — Fecha `w-24 whitespace-nowrap`, Resultado `w-32` (el badge puede partir en 2 líneas si el nombre es largo), chevron `w-8`; Gestión toma el resto y la nota ya envuelve con `whitespace-pre-wrap`. El `overflow-x-auto` se queda solo como red de seguridad.
- En el detalle de oportunidad, clicar una fila de la MISMA oportunidad navega a sí misma — inofensivo, no complicar con casos especiales.

### 3c. "Compras anteriores" (en `ficha-cuenta.tsx`)

- Revisar que no desborde: la columna Equipos envuelve (es texto plano con " · "), Fecha y Cotización `whitespace-nowrap`, Total a la derecha. No es clickeable (no tiene destino único) — no inventarle navegación.

## Orden de ejecución y commits

1. Pieza 1 (color) → commit "B9.1 jerarquia de color en chips seleccionados".
2. Pieza 2 (helper + reorden + revelado progresivo) → commit.
3. Pieza 3 (filas clickeables, sin Ver, sin scroll horizontal) → commit.
4. Actualizar `docs/04` (sección B9 con el detalle real), build+lint, push final.

**Verificación:**
- Pieza 2a: script con cuenta VERIF (actividades con/sin resultado + cotización + venta) comprobando que `cargarHistorialCuenta()` devuelve los mismos eventos (conteo, orden, resultado del join) que devolvía la lógica inline — es la única pieza con riesgo de regresión de datos. Limpiar al final.
- Piezas 1, 2b, 2c y 3 son de UI: build+lint limpios y grep de consistencia (ningún "Ver" residual en tablas, ningún chip de selección con granate sólido). La interacción real (clic en fila, expansión del formulario, hover) queda como **verificación manual en navegador de Darwin**, listada al final en docs/04.

**Criterio de aceptación global:** el vendedor abre una oportunidad y en la primera pantalla ve el formulario compacto (2 renglones) seguido de la historia COMPLETA del cliente en la tabla estilo Excel; al escribir una nota el formulario se despliega con lo opcional; en cualquier tabla de la app, clicar la fila abre el registro sin buscar botones ni hacer scroll horizontal; y el único elemento granate sólido de cada vista es su acción primaria.

## Queda explícitamente FUERA de B9 (no implementar)
- Destacar visualmente los eventos de la oportunidad actual dentro del feed (evaluar tras el piloto).
- Tocar `vista-oportunidades`/kanban o las tablas de gerencia que no tienen botón "Ver".
- Cambios en la server action `registrarActividad` (quedó bien en B8.2).
- Responsive móvil a fondo (el piloto es en desktop; solo no romper lo que ya funciona).
