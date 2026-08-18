# B11 — Alinear el CRM con la taxonomía oficial + cargar ventas históricas

**Contexto obligatorio antes de empezar:** leer `docs/08-taxonomia-oficial-efameinsa.md`. Todo este plan sale del manual `EF-CRMAGE-COM-2020` que Efameinsa usa desde 2020, relevado el 2026-08-18.

**Decisión de Darwin ya tomada (no reabrir):** en la interfaz se muestra **solo el nombre legible** ("Alto potencial"), nunca el código del Excel (`Alto_POTENCIAL`). El código es una limitación de la hoja de cálculo, no algo que valga preservar.

---

## Pieza 1 — Migración 0017: intención de compra a 5 niveles

**Por qué:** su manual define 5 niveles con criterios de comportamiento; nuestro enum tiene 3. Colapsar "está buscando financiamiento" y "está buscando ubicación" en un mismo "media" pierde información comercial real.

**Enum nuevo:** `alto_potencial`, `medio_alto`, `medio`, `medio_bajo`, `bajo`, `sin_definir`

**Mapeo de lo ya existente (conservador a propósito):**

| Valor actual | Pasa a | Razón |
|---|---|---|
| `alta` | `medio_alto` | NO a `alto_potencial`: ese nivel significa "espera OC o depósito", un hecho concreto que no podemos afirmar de datos viejos |
| `media` | `medio` | equivalente directo |
| `baja` | `bajo` | equivalente directo |
| `sin_definir` | `sin_definir` | — |

**⚠️ Trampa conocida de este proyecto (ya nos mordió 3 veces):** un `CASE` que alimenta una columna enum en SQL crudo **necesita cast explícito** `::intencion_compra`. Sin el cast falla siempre. Ver migraciones 0003, 0006 y el comentario en la memoria del proyecto.

Postgres no permite reordenar ni quitar valores de un enum, así que hay que crear el tipo nuevo, convertir la columna y renombrar:

```sql
create type intencion_compra_v2 as enum
  ('alto_potencial','medio_alto','medio','medio_bajo','bajo','sin_definir');

alter table oportunidades alter column intencion drop default;
alter table oportunidades alter column intencion type intencion_compra_v2
  using (case intencion::text
    when 'alta'  then 'medio_alto'
    when 'media' then 'medio'
    when 'baja'  then 'bajo'
    else 'sin_definir'
  end)::intencion_compra_v2;   -- ← el cast va acá, no adentro del case
alter table oportunidades alter column intencion set default 'sin_definir';

drop type intencion_compra;
alter type intencion_compra_v2 rename to intencion_compra;
```

**Verificar después:** que la app compile (el tipo TS de `database.ts` cambia) y que ninguna oportunidad haya quedado en null.

---

## Pieza 2 — Catálogo de textos y componente reutilizable

**Este es el corazón del bloque.** No resolverlo solo para intención de compra: cuatro campos tienen el mismo problema y cualquier campo futuro lo heredará.

### 2a. Catálogo de textos — `src/lib/catalogos-ui.ts` (nuevo)

Una sola fuente de verdad con `{ valor, etiqueta, criterio }`. Textos **tomados literalmente del manual**, adaptados a lenguaje de pantalla (sin códigos, sin mayúsculas gritadas):

**Intención de compra**
| valor | etiqueta | criterio |
|---|---|---|
| `alto_potencial` | Alto potencial | Espera la orden de compra o el depósito |
| `medio_alto` | Medio alto | Ya tiene local o dio una fecha exacta |
| `medio` | Medio | Está buscando ubicación |
| `medio_bajo` | Medio bajo | Está buscando financiamiento |
| `bajo` | Bajo | Solo quiere saber, sin intención concreta |
| `sin_definir` | Sin definir | Todavía no se ha calificado |

**Etapa de la oportunidad** (usar el criterio del manual, no una definición inventada)
| valor | etiqueta | criterio |
|---|---|---|
| `asignada` | Asignada | Recibida, aún sin filtrar |
| `filtrada` | Filtrada | Filtro hecho en SUNAT y redes: ya se sabe con quién se habla |
| `cotizada` | Cotizada | Cotización enviada al cliente |
| `seguimiento` | En seguimiento | Se está insistiendo, sin respuesta final |
| `potencial` | Potencial | Pidió esperar para depositar, o está emitiendo la orden de compra |
| `venta` | Venta | Aceptó la cotización y se convirtió en cliente |
| `rechazada` | Rechazada | Se perdió el contacto o no procede |
| `derivada` | Derivada | Pasada a otro comercial u otra área |

**Motivo de rechazo:** ya son autoexplicativos, pero pasarlos al mismo formato por consistencia (criterio puede ir vacío).

**Resultado de gestión** (catálogo editable de B8): el criterio sale de la propia tabla si tiene descripción; si no, dejarlo vacío.

### 2b. Componente `SelectConCriterio` — `src/components/crm/select-con-criterio.tsx` (nuevo)

Basado en el `Select` que ya existe en `src/components/ui/select.tsx` (Base UI, **no** es un `<select>` nativo, así que sí acepta contenido enriquecido en cada opción).

Cada opción muestra:
```
Etiqueta               ← texto normal, peso medio
Criterio               ← una línea, text-xs, text-muted-foreground
```

Y **debajo del campo, una vez elegido**, el criterio del valor seleccionado como texto de ayuda — para confirmar sin volver a abrir.

**Reglas de diseño (respetar el lenguaje visual ya establecido en B6/B9):**
- El criterio **siempre visible**, nunca detrás de hover. Motivo: funciona en tablet, con teclado y para lector de pantalla; y el que más lo necesita es el usuario nuevo, que no sabe que hay que pasar el puntero.
- Si `criterio` viene vacío, renderizar solo la etiqueta (sin hueco).
- No inventar criterios: si un valor no está en el manual, dejarlo sin criterio antes que escribir una definición propia.

### 2c. Aplicarlo en las cuatro pantallas

| Dónde | Campo |
|---|---|
| `components/crm/` — card "Calificación" del detalle de oportunidad | intención de compra |
| `CambiarEtapa` | etapa |
| `CambiarEtapa` (al rechazar) | motivo de rechazo |
| `RegistroRapido` | resultado de gestión |

---

## Pieza 3 — Reglas de inactividad (1 mes / 3 meses)

El manual define dos umbrales que hoy el CRM no conoce:

- **Prospecto sin respuesta 1 mes** → corresponde rechazar
- **Cotización sin respuesta 3 meses** → corresponde rechazar

**Decisión de diseño — NO cambiar el estado automáticamente.** El manual dice "mandar cambiar su estado a Rechazado": es una instrucción para que una persona lo revise, no un proceso automático. Cambiar estados solo, en silencio, sobre datos comerciales reales es riesgoso y poco transparente.

**En su lugar:** extender la vista `v_oportunidades_inactivas` (ya existe desde B1) para que marque el umbral que corresponde según la etapa, y mostrarlo donde el comercial ya mira:
- En "Mi día", un grupo nuevo junto a los vencidos: **"Corresponde cerrar"**, con el motivo ("3 meses sin respuesta desde la cotización").
- Acción de un clic para rechazar, que igual exige motivo (la regla actual no se toca).

---

## Pieza 4 — Importar ventas históricas (1,559 registros, ~USD 5.5 M)

**Datos ya extraídos:** `scripts/data/ventas-historicas-COTIZ.json` — razón social, monto, fecha, número de presupuesto, archivo de origen.

### Paso 0 — Verificar antes de escribir (obligatorio)

No asumir la estructura. Antes de tocar la base, confirmar contra los Excel de `R:\`:
1. ¿Las filas de la hoja `COTIZ.` son **una por cotización** o **una por gestión** (varias por cliente)? El manual sugiere que son gestiones con fecha, como en `PROSP.`.
2. ¿La hoja `COTIZ.` trae RUC/DNI, o solo razón social? De eso depende cómo enlazar con las 14,270 cuentas ya cargadas.
3. ¿Cuántas de las 1,559 ventas **hacen match** con una cuenta existente? Reportar el número antes de continuar.

### Paso 1 — Crear el script `scripts/importar-ventas-historicas.mjs`

Mismo patrón que los otros: `--aplicar` para escribir, sin flag = simulación.

Por cada fila `C4_VENTA` que haga match con una cuenta:
1. Crear `oportunidades` con `etapa='venta'`, `cerrada_at` = fecha del Excel, `comercial_id` = dueño de la cuenta, `monto_estimado` = monto.
2. Crear `ventas` con `monto_total`, `fecha_venta`, `oportunidad_id`.

**Obstáculos concretos que hay que resolver (no improvisar):**

- `ventas.serie` es **NOT NULL** (`EFAMEINSA` u `OPEN`) y el Excel no lo dice. Revisar si el número de presupuesto (formato `2203-23`) lo permite inferir; **si no se puede, preguntar a Darwin antes de asumir** — no inventar la serie.
- `ventas.registrada_por` es **NOT NULL**. Usar el comercial dueño de la cuenta.
- `cotizacion_id` es nullable → dejarlo en null (no existen los documentos históricos).
- **Efecto secundario deseado:** insertar en `ventas` dispara el trigger que actualiza `cuentas.ultima_venta_at`, lo que hace que **la regla de cartera de 6 meses empiece a funcionar sobre datos reales**. Verificarlo explícitamente después de la carga.
- Los 17 montos con formato raro (algunos traen el número de presupuesto en la columna de monto) → **saltarlos y reportarlos**, no adivinar.

### Paso 2 — Verificar con datos reales

- Total de ventas cargadas y suma de montos (contra las cifras de este documento).
- Abrir una ficha de cliente con venta histórica y confirmar que **se ve el precio al que se le vendió** — este es el pedido textual de gerencia: *"si le vendiste a $15k el año pasado y cotizas $10k, regalaste $5k"*.
- Confirmar que `ultima_venta_at` quedó poblado y que la vista de cartera liberable ahora devuelve resultados coherentes.

---

## Orden de ejecución

1. Migración 0017 (enum de 5 niveles) → `npm run db:migrar`
2. `catalogos-ui.ts` + `SelectConCriterio`
3. Aplicarlo en los 4 campos
4. Vista de inactividad + grupo "Corresponde cerrar" en Mi día
5. Script de ventas históricas: **paso 0 (verificar) → reportar → simular → aplicar**
6. Verificación end-to-end con datos reales

**Commit y push por pieza** (Vercel redespliega en cada push). Deploy hook en `.env.local` como `VERCEL_DEPLOY_HOOK` si el auto-deploy se queda en un commit viejo.

---

## Recordatorios de este proyecto (no repetir errores ya cometidos)

- **`CASE` → columna enum necesita cast explícito** `::tipo_enum` en SQL crudo. Nos falló 3 veces.
- **Contar filas grandes con `pg.Client` y SQL crudo**, no con `supabase.from().select()` — PostgREST corta en 1000 filas sin avisar.
- **Limpieza de pruebas con `service_role`** y revisando `{ error, count }` de cada `.delete()`: con un rol de aplicación, RLS bloquea el borrado en silencio y afecta 0 filas.
- **Verificar contra datos reales, no solo que compile.** Todos los bugs serios de este proyecto pasaron el build y el lint.
- **No tocar los datos de prueba que creó Darwin** navegando la app ("Hank Prueba", "prueba contacto", cuenta "Sideral Prueba").
- Al limpiar registros de prueba, **acotar el filtro a los propios** — una vez se borró por título y se llevó por delante la notificación de un lead real.

## Fuera de este bloque (pendientes de terceros)

- **Parseo del correo del ERP con n8n** → falta que Darwin consiga un buzón que reciba copia de los correos de `central@efameinsa.com`.
- **Validación automática de RUC en SUNAT** → la mejor oportunidad de n8n (el filtro es obligatorio y se hizo 14,414 veces), pero requiere montar el flujo.
- **Catálogo de productos** → bloqueado por las 7 preguntas del cuestionario entregado a Efameinsa.
- **Meta Ads / WhatsApp oficial** → bloqueado por la verificación de negocio de Meta.
