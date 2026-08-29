# Plan de pruebas — CRM Efameinsa

Para ejecutar con Sonnet antes de la salida definitiva. Contexto: leer
`CLAUDE.md` primero. Las lecciones de verificación que motivan cada grupo
están al final — no saltárselas.

**✅ Sección 1 (unitarias) EJECUTADA 2026-08-19** — `npm test` (Vitest), 103
pruebas, todas verdes. `npm run test:watch` para desarrollo. Quedan
pendientes las secciones 2-5 (funciones SQL, RLS, endpoints, humo de UI),
que necesitan Supabase real y no son unitarias.

## 0. Preparación

- Framework: **Vitest** (`npm i -D vitest`) para unitarias puras; las de base
  de datos van como scripts `node --env-file=.env.local` contra Supabase real
  usando transacciones con `rollback` (patrón ya usado en la sesión 19-08:
  `set_config('request.jwt.claims', …)` + `set local role authenticated`).
- NUNCA limpiar datos con un rol de aplicación: usar `service_role` y revisar
  `{ error, rowCount }` de cada delete.

## 1. Unitarias puras (Vitest, sin red)

| Módulo | Casos clave |
|---|---|
| `src/lib/periodo.ts` | `hoyLima` con TZ del server en UTC; `periodoPreset` de cada preset en bordes de mes/año (31-dic, 29-feb); `resolverPeriodo` con params inválidos, desde>hasta, detección de preset |
| `src/lib/fechas.ts` | date vs timestamptz: `fechaCalendario("2026-08-16")` NO se corre un día; `fechaHoraLima` convierte a Lima |
| Parser de montos (extraer a `src/lib/…` desde `scripts/importar-ventas-historicas.mjs`) | `"US$ 1,905.93"`, `"S/. 983.00"`→PEN, `"2.238.87"`, `"$ 3,850,00"`, `"560-21"`→null, `"4100\r\n"` |
| Parser de horas (importar-central-historico) | `"10:13 am"`, `"2:22 pm "`, serial excel 0.5→12:00, `"4.63"`→null, 0.99999→23:59 no 24:00 |
| `normalizar_telefono` (SQL) y su gemelo JS | +51 9xx, espacios, 51 prefijo solo si >9 dígitos |
| `codigoPro` / `codigoCentral` | "PRO 11591", "PR0026" (O↔0), "pro-220", null |
| Tokenización de `buscarCoincidencias` | tildes (María→MARIA), tokens <3 letras fuera, máx 4 |

## 2. Funciones SQL (script con rollback, datos sembrados)

- `resumen_gerencia`: (a) embudo cuenta SOLO origen='crm'; (b)
  `ventas_historicas_periodo` cuenta las excluidas; (c) recurrente = compra
  previa al período; (d) conversión PEN con `parametros.tc_usd_pen`; (e) un
  comercial pidiendo `p_comercial=null` → excepción; (f) tiempo < 1 s.
- `listar_clientes`: paginación estable, filtros combinados, comercial ve
  solo su cartera, búsqueda por teléfono ≥6 dígitos.
- `leads_por_origen`: agrega los 39k sin tope de 1.000; comercial → excepción.
- `via_de_procedencia`: mapa completo + default 'otro'.
- `asignar_lead` / `crear_cotizacion` / `registrar_venta`: flujo completo con
  cliente nuevo (¡el CASE sin cast a enum ya mordió 3 veces!) y verificación
  de `ultima_venta_at`.

## 3. RLS (crítico — correr como cada rol con el patrón set_config)

- comercial: no ve leads de bandeja ajenos, no ve cuentas de otra cartera,
  no puede `reprogramarAccion` de oportunidad ajena (update afecta 0 filas y
  la action lo reporta), no modifica `tareas_agenda` ajenas.
- central: lee cuentas (pre-filtro), crea leads, NO borra oportunidades.
- Toda política nueva usa `(select auth.uid())` — verificar con
  `select qual from pg_policies where qual like '%auth.uid()%' and qual not like '%( SELECT%'`
  que no reaparezcan llamadas desnudas (regresión de la migración 0030).

## 4. Endpoints (curl contra preview o local)

- `/api/alertas/leads-esperando`: 401 sin token; umbrales `?min`/`?horas`;
  respuesta con leads sembrados vencidos.
- `/api/webhooks/google-leads`: clave inválida→401, `is_test`→200 sin lead,
  duplicado por `lead_id`→200 sin duplicar, caída de DB→500.
- `/api/gasto-campania` y `/api/cron/gasto-diario`: token, upsert idempotente
  (2 POST iguales = 1 fila).
- Webhooks salientes a n8n: con `N8N_LEAD_WEBHOOK_URL` inválida el lead se
  crea igual (best-effort).

## 5. Humo de UI (fetch con sesión real — patrón magic link de la sesión 19-08)

Toda página de cada rol responde 200 **y sin `data-dgst=`** en el HTML (los
errores de streaming NO aparecen como texto: buscar ese marcador). Verificar
los deploys por marcadores SSR o por el CSS compilado, nunca por textos de
paneles/popovers condicionales (viven en chunks JS).

## Lecciones que motivan todo esto

1. supabase-js corta en 1.000 filas sin avisar — cualquier `select` sin
   `.limit()` explícito sobre tablas grandes es un bug latente.
2. `CASE` con literales → columna enum necesita `::enum` en SQL crudo.
3. Fechas: columnas `date` jamás pasan por conversión de zona.
4. RLS: funciones desnudas en políticas = evaluación por fila.
5. Popovers dentro de contenedores con overflow → `position: fixed`.
6. Contar columnas vs placeholders a mano en SQL crudo ya falló dos veces.
