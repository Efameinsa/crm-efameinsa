# Plan de ejecución — Supervisión diaria de comerciales (vista de gerencia)

> **Para quien ejecute este plan (Sonnet u otro):** léelo entero antes de tocar
> nada, y lee también el `CLAUDE.md` del repo. La sección 8 lista los errores
> que este proyecto YA cometió; cada uno costó una corrección en producción.
> No es documentación decorativa: son trampas reales de esta base de datos.

Versión 1.0 — 2026-08-20 · Elaborado por Santos Lenin Vilcachagua Ayala

---

## 1. Qué pidió gerencia (textual)

El ing. Carlos pide, **desde la vista de gerencia**:

1. **Agenda diaria de cada comercial** — qué tiene programado cada uno hoy.
2. **Reporte de las gestiones realizadas en el día** — qué hizo cada uno.
3. **Indicador de 30 seguimientos efectivos** como mínimo (por comercial, por día).
4. **Cotizaciones ejecutadas**.

El objetivo detrás: poder abrir una pantalla en la mañana y saber, sin llamar a
nadie, quién está trabajando su cartera y quién no.

---

## 2. Qué NO hay que hacer

- **No** rehacer la agenda del comercial: ya existe (`/comercial/agenda`,
  `src/components/crm/agenda-mensual.tsx`). Esto es una vista **consolidada de
  todos los comerciales** para gerencia, no una copia por comercial.
- **No** crear una tabla nueva de "seguimientos": todo sale de `actividades`,
  `oportunidades` y `cotizaciones`, que ya existen.
- **No** tocar `resumen_gerencia`: esta pantalla usa su propia función. Esa ya
  se recreó siete veces y cada recreación es riesgo.

---

## 3. Decisiones ya tomadas (no volver a discutirlas)

### 3.1 Qué cuenta como "seguimiento efectivo"

Un seguimiento cuenta como **efectivo** cuando hubo contacto real con el
cliente:

```
tipo IN ('llamada', 'whatsapp', 'email', 'visita')
Y (resultado_id IS NULL OR resultado.codigo <> 'NO_CONTESTO')
```

Razonamiento:
- Se excluye `tipo = 'nota'` porque es registro interno, no contacto. **Además
  hay 1.560 actividades tipo `nota` que son el histórico importado** (una por
  venta del Excel): si se cuentan, el indicador nace contaminado.
- `NO_CONTESTO` es un intento, no un contacto. Se cuenta aparte como "intentos"
  para que el comercial no sienta que su trabajo desaparece.

**El umbral (30) y esta definición van en la tabla `parametros`**, igual que
`tc_usd_pen`, para que gerencia los cambie sin tocar código:
- `meta_seguimientos_diarios` (valor por defecto: 30)

> ⚠️ Confirmar con Carlos si "efectivo" incluye o no los intentos fallidos.
> Mientras no responda, se usa la definición de arriba y la pantalla muestra
> **ambos números** (efectivos e intentos), así que la duda no bloquea nada.

### 3.2 Alcance temporal

La pantalla muestra **un día** (por defecto hoy, en hora de Lima) y permite
elegir otro con el selector existente. Nada de rangos: es una herramienta de
supervisión diaria, no un reporte de período (ese ya existe en `/gerencia`).

---

## 4. Diseño de datos — migración `0038_supervision_diaria.sql`

Crear **una** función. Toda la agregación va en Postgres, nunca en JavaScript
(ver 8.1).

```sql
create or replace function supervision_diaria(p_fecha date default null)
returns jsonb
language plpgsql
stable
security definer          -- ver 8.3
set search_path = public
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Lima')::date);
  v_meta  integer := coalesce((select valor::integer from parametros
                               where clave = 'meta_seguimientos_diarios'), 30);
  v_filas jsonb;
begin
  if not es_backoffice() then
    raise exception 'No autorizado';
  end if;
  ...
end $$;
```

**Estructura de retorno** (respetarla: la UI depende de ella):

```jsonc
{
  "fecha": "2026-08-20",
  "meta_seguimientos": 30,
  "comerciales": [
    {
      "id": "uuid",
      "nombre": "Katerine Tello",
      "codigo": "C5",
      "codigo_anterior": "C8",          // puede ser null
      "seguimientos_efectivos": 12,
      "intentos_sin_contacto": 4,        // NO_CONTESTO
      "cumple_meta": false,
      "por_tipo": { "llamada": 8, "whatsapp": 3, "email": 1, "visita": 0 },
      "cotizaciones": 2,                 // creadas ese día (tabla cotizaciones)
      "ventas": 1,                       // oportunidades que pasaron a venta ese día
      "monto_vendido_usd": 3590,
      "agenda_pendiente": 7,             // proxima_accion_at = fecha y sin gestión ese día
      "agenda_vencida": 3,               // proxima_accion_at < fecha, aún abierta
      "primera_gestion": "09:14",        // hora Lima, null si no gestionó
      "ultima_gestion": "17:42"
    }
  ],
  "totales": { "seguimientos_efectivos": 0, "cotizaciones": 0, "ventas": 0,
               "comerciales_en_meta": 0, "comerciales_sin_actividad": 0 }
}
```

**Reglas de cálculo, una por una:**

| Campo | Cómo se calcula |
|---|---|
| `seguimientos_efectivos` | `actividades` con `realizada_por = comercial`, `(realizada_at at time zone 'America/Lima')::date = v_fecha`, tipo en la lista de 3.1, resultado distinto de `NO_CONTESTO` |
| `intentos_sin_contacto` | igual pero con resultado `NO_CONTESTO` |
| `por_tipo` | mismo filtro que efectivos, agrupado por `tipo` |
| `cotizaciones` | `cotizaciones` unidas a `oportunidades` por `comercial_id`, con `(created_at at time zone 'America/Lima')::date = v_fecha` |
| `ventas` / `monto_vendido_usd` | `ventas` con `fecha_venta = v_fecha` (columna `date`, **sin** conversión de zona) de oportunidades del comercial, `origen = 'crm'` |
| `agenda_pendiente` | `oportunidades` del comercial, etapa abierta, `proxima_accion_at = v_fecha`, **sin** actividad registrada ese día |
| `agenda_vencida` | `oportunidades` del comercial, etapa abierta, `proxima_accion_at < v_fecha` |
| `primera/ultima_gestion` | `min/max(realizada_at at time zone 'America/Lima')::time` de las efectivas |

Incluir a **todos** los comerciales activos, también los que no hicieron nada
(esos son justamente los que gerencia necesita ver): `perfiles` con
`rol='comercial' and activo` por LEFT JOIN LATERAL, nunca por INNER JOIN sobre
actividades.

**Permisos al final del archivo:**

```sql
revoke all on function supervision_diaria(date) from public;
grant execute on function supervision_diaria(date) to authenticated;
```

**Seed del parámetro** (idempotente, en la misma migración):

```sql
insert into parametros (clave, valor, descripcion)
values ('meta_seguimientos_diarios', 30, 'Seguimientos efectivos mínimos por comercial por día')
on conflict (clave) do nothing;
```

> Verificar antes el nombre real de las columnas de `parametros` — si no
> tiene `descripcion`, ajustar el insert. No inventar columnas.

---

## 5. Diseño de UI — `/gerencia/supervision`

### 5.1 Ruta y archivos

- `src/app/(app)/gerencia/supervision/page.tsx` — Server Component,
  `export const dynamic = "force-dynamic"`.
- `src/app/(app)/gerencia/supervision/loading.tsx` — reutilizar
  `EsqueletoPanel` como hacen las otras vistas.
- `src/components/crm/tarjeta-supervision.tsx` — la tarjeta por comercial.
- Añadir el enlace en `src/components/crm/nav-lateral.tsx`, sección gerencia,
  con un ícono de `lucide-react` (p. ej. `ClipboardCheck`).

### 5.2 Composición de la pantalla

1. **Barra superior**: `SelectorFecha` (ya existe, `selector-fecha.tsx`) con
   `max` = hoy — no tiene sentido supervisar el futuro. A su derecha, texto
   "Lunes 20 de agosto" con `fechaCalendarioLarga`.
2. **Fila de KPIs** (`Kpi` existente): seguimientos efectivos del día /
   cotizaciones / ventas / comerciales que cumplieron la meta.
3. **Una tarjeta por comercial**, ordenadas por seguimientos efectivos
   descendente (el que más trabajó arriba). Cada tarjeta:
   - Nombre + código (y `· antes C8` si tiene `codigo_anterior`).
   - **Barra de progreso hacia la meta**: `seguimientos_efectivos / meta`.
     Verde (`#1E7F4F`) al llegar a la meta, granate (primary) por debajo,
     gris si no hubo actividad. Mostrar `12 / 30`.
   - Chips con el desglose por tipo (llamada, WhatsApp, correo, visita).
   - Línea secundaria: `N intentos sin contacto · N cotizaciones · N ventas`.
   - **Alertas**: si `agenda_vencida > 0`, chip ámbar "N vencidas". Si no hubo
     ninguna gestión, franja gris "Sin actividad registrada".
   - Horario: "09:14 → 17:42" cuando haya gestiones.
   - Toda la tarjeta enlaza a `/gerencia/comerciales/[id]` conservando la fecha.

### 5.3 Reglas de diseño de este proyecto

- Nada de librerías de gráficos: barras con `div` y Tailwind, como
  `barra-etapa.tsx` y `tabla-por-comercial.tsx`.
- Colores: granate `--primary`, verde `#1E7F4F` para éxito, ámbar para
  advertencia. No introducir colores nuevos.
- La tabla/tarjetas deben ser legibles en móvil: `overflow-x-auto` en
  contenedores anchos, nunca scroll horizontal en el `body`.
- Texto en español de Perú, tono directo. "Seguimientos efectivos", no
  "Effective follow-ups".

---

## 6. Orden de ejecución

1. Leer `CLAUDE.md` y esta sección 8 completa.
2. Confirmar columnas reales de `parametros`, `actividades` y
   `catalogo_resultados_gestion` con una consulta — **no asumir**.
3. Escribir `supabase/migrations/0038_supervision_diaria.sql`.
4. Aplicar con `node --env-file=.env.local scripts/aplicar-migracion.mjs`.
5. **Probar la función sola en SQL** con `set_config('request.jwt.claims', …)`
   como gerencia, antes de escribir una línea de UI. Ver 7.1.
6. Tipos en `src/lib/reportes.ts` (o un archivo nuevo `supervision.ts`) +
   función `cargarSupervisionDiaria(supabase, fecha)`.
7. UI: página, tarjeta, enlace en el nav.
8. `npm run build && npm run lint && npm test` — los tres en verde.
9. Verificar en producción tras el push (ver 7.2).
10. Commit por pieza, mensaje en español explicando el porqué.

---

## 7. Cómo verificar (obligatorio)

### 7.1 La función, antes de la UI

```js
// scripts/_v.mjs (temporal, borrar después)
const { rows: [g] } = await c.query(`select id from perfiles where rol='gerencia' limit 1`);
await c.query(`select set_config('request.jwt.claims',
  json_build_object('sub',$1::text,'role','authenticated')::text,false)`, [g.id]);
const { rows: [{ r }] } = await c.query(`select supervision_diaria('2026-08-19') as r`);
console.log(JSON.stringify(r, null, 2));
```

Comprobar a mano contra la base:
- que aparezcan **todos** los comerciales activos, incluso con 0;
- que un comercial sin actividad tenga `seguimientos_efectivos: 0` y no falte;
- que las 1.560 actividades `nota` del histórico **no** entren en el conteo;
- que como comercial (no gerencia) la función lance "No autorizado".

### 7.2 En producción, con sesión real

Patrón ya usado en este proyecto (`admin.auth.admin.generateLink` +
`verifyOtp` + cookie `sb-<ref>-auth-token=base64-<base64url(JSON)>`):
- `/gerencia/supervision` responde 200 **y sin `data-dgst=`** en el HTML;
- un comercial recibe redirección/403, no la pantalla;
- los marcadores de texto que se busquen deben ser **substrings contiguos de
  un solo literal** (React intercala `<!-- -->` entre expresiones JSX).

---

## 8. Errores que este proyecto ya cometió — no repetirlos

**8.1 · El tope de 1.000 filas de supabase-js.** Cualquier `select` sin
`.limit()` explícito o filtro estrecho sobre `leads`, `oportunidades`,
`cuentas`, `actividades` o `cotizaciones_historicas` devuelve como máximo 1.000
filas **sin avisar**. Ya rompió el embudo de gerencia, el kanban de C5 y el
bloque de marketing. Por eso esta pantalla agrega en SQL, no en JS.

**8.2 · Fechas.** Hay dos tipos de columna y no se tratan igual:
- `timestamptz` (`realizada_at`, `created_at`) → **siempre**
  `at time zone 'America/Lima'` antes de sacar la fecha. Sin eso, una gestión
  de las 8 pm cae al día siguiente y el reporte diario miente.
- `date` (`fecha_venta`, `proxima_accion_at`) → **nunca** convertir zona; se
  comparan tal cual. Convertirlas las corre un día.

**8.3 · RLS y rendimiento.** Toda política nueva envuelve las funciones:
`(select auth.uid())`, `(select es_backoffice())`. Desnudas se evalúan **por
fila** — con 39.000 leads eso llevó una consulta de 113 ms a 3,7 segundos.
Y las funciones de reporte van `security definer` con chequeo explícito de
autorización al inicio: como invoker, la RLS las vuelve ~25× más lentas.

**8.4 · `CASE` hacia una columna enum** necesita cast explícito (`::etapa_oportunidad`).
Este error ya se coló tres veces en migraciones distintas.

**8.5 · Server → Client Components:** no pasar funciones como props (un
`formato={fn}` tiró la página entera con el digest 2040212526). Pasar strings
ya formateados.

**8.6 · Popovers** dentro de paneles con `overflow` o animaciones: `position:
fixed` **y** portal al `body`. El panel de la agenda usa `translate-x`, y un
`fixed` sin portal se ancla al panel en vez del viewport y desaparece de
pantalla.

**8.7 · Los `<Kpi>` y `<Velocimetro>` renderizan 0 en SSR** (animan al montar).
No confundir con datos vacíos al verificar el HTML.

**8.8 · Datos de prueba:** si creas alguno, bórralo con `service_role` y revisa
`{ error, count }` de cada delete — RLS puede bloquear un borrado en silencio y
dejar basura. Nunca borrar datos que no creaste tú.

---

## 9. Criterios de aceptación

- [ ] `/gerencia/supervision` carga en menos de 1,5 s y sin errores de streaming.
- [ ] Aparecen los 6 comerciales activos, incluidos los que no gestionaron nada.
- [ ] El conteo excluye las actividades `nota` del histórico importado.
- [ ] La barra de meta se pone verde exactamente al llegar a 30 (o al valor de
      `parametros`), no antes.
- [ ] Cambiar la fecha en el selector cambia todos los números (probar con un
      día con datos y otro sin).
- [ ] Un comercial no puede entrar a la pantalla ni ejecutar la función.
- [ ] Gerencia puede cambiar la meta desde `parametros` y la pantalla lo respeta
      sin redeploy.
- [ ] `npm run build`, `npm run lint` y `npm test` en verde.

---

## 10. Fuera de alcance (para después)

- Notificar automáticamente al comercial que va por debajo de la meta.
- Histórico de cumplimiento (racha semanal/mensual) — primero validar el
  indicador diario con gerencia.
- Exportar el reporte a PDF.
