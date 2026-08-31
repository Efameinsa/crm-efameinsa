# Plan 24 · Las vistas de los documentos del servidor

**Para la sesión que lo ejecute (Sonnet):** este plan es el hermano del 23 (la
navegación de postventa) y se puede hacer antes, después o intercalado — no se
pisan. Mismas reglas duras: leer `CLAUDE.md` y `docs/19` antes, commitear
archivo por archivo, y **push solo a la 1 pm o a las 6 pm**.

**Qué resuelve:** que desde el CRM se puedan ver los informes (PDF y Word), las
fotos por cliente y los videos que viven en el servidor de la oficina
(`\\192.168.10.210`, 22,6 GB de informes, fotos y videos por cliente). Es «la
riqueza de postventa» según el propio Santos, y la pieza que gerencia aprobó
con urgencia el 31-08.

---

## 1 · Lo que YA está construido (no rehacer nada de esto)

| Pieza | Dónde | Estado |
|---|---|---|
| El servicio de archivos del servidor | `scripts/servidor-archivos.mjs` | **Probado** contra las carpetas reales. Solo lectura (POST/PUT/DELETE/PATCH → 405), solo extensiones de documento/foto/video, solo redes privadas, ignora temporales de Word, registro auditable. |
| Enlaces firmados de ARCHIVO | `src/lib/archivos-servidor.ts` → `enlaceFirmado()` | Listo. HMAC + vencimiento de 5 min, igual que R2. |
| Listado firmado de UNA carpeta | endpoint `/carpeta` del servicio + `listarCarpetaServidor()` | **Probado**: 64 elementos de una carpeta real de cliente, firma con prefijo `carpeta:` (una firma de archivo NO sirve para listar, verificado). |
| **La carpeta como PÁGINA** | el mismo `/carpeta` cuando se navega (Accept: text/html) | **Probado**: página con la marca, buscador instantáneo, cada archivo y subcarpeta con su enlace firmado, filtro `?q=` por nombre. |
| Variables del CRM | `.env.local` → `ARCHIVOS_URL`, `ARCHIVOS_SECRETO` | El secreto ya está pactado con Sistemas (está en las instrucciones que se le entregaron). `ARCHIVOS_URL` se configura cuando Sistemas confirme el puerto. |

### La restricción que dicta todo el diseño de la fase 1

El CRM es **https** y el servicio del servidor es **http** (el certificado es
la etapa 2 de Sistemas). El navegador **bloquea leer datos** de http desde una
página https (contenido mixto)… pero **navegar** hacia http sí está permitido.

Conclusión: en fase 1 **todo lo del servidor se abre en pestaña nueva** (el
informe, la foto, el video y la carpeta-como-página). Nada del servidor se
dibuja *incrustado* dentro de la ficha hasta que exista el certificado. No
intentes esquivarlo con fetch: el navegador lo va a bloquear en silencio, que
es el peor modo de fallar.

Y la segunda restricción: **Vercel no puede ver la red de la oficina.** El
servidor del CRM jamás puede listar carpetas en producción; por eso el índice
de carpetas vive en la base (§3) y los archivos los abre siempre el navegador.

---

## 2 · Las vistas, una por una

### V1 · Panel «Documentos del servidor» en la ficha del cliente

Va en `ficha-cuenta.tsx` (⚠️ coordinar con el plan 23, que no la toca) y en la
ficha de oportunidad/caso, debajo del panel «Equipos de este cliente». Server
component + un client component chico para el diálogo de vincular.

**Estado C — vinculado (el normal):**
```
┌ DOCUMENTOS DEL SERVIDOR ─────────────────── desde la oficina ┐
│  📄 Informes técnicos        [Abrir carpeta ↗]               │
│     S. PRIVADO\COINREFRI                                     │
│  🖼️ Fotos del cliente        [Abrir carpeta ↗]               │
│     09. fotos\CLIENTES\COINREFRI                             │
│  ──────────────────────────────────────────────────────────  │
│  Se abren en una pestaña nueva, servidos por el servidor de  │
│  la empresa. Solo funcionan desde la red de la oficina.      │
└──────────────────────────────────────────────────────────────┘
```
- Cada botón es un `<a target="_blank">` con `enlaceCarpetaFirmado()` (nueva
  función en `archivos-servidor.ts`: como `listarCarpetaServidor` pero devuelve
  la URL en vez de hacer fetch — extraer el armado de URL a un helper común).
- Si `servidorDeArchivosActivo()` es falso (variables sin configurar), el panel
  **no se muestra**: no se anuncia lo que no existe.
- La nota «solo desde la oficina» es fija y honesta: desde afuera el enlace no
  va a abrir, y la persona tiene que saber por qué ANTES de hacer clic.

**Estado B — cliente sin carpeta vinculada:**
```
┌ DOCUMENTOS DEL SERVIDOR ─────────────────────────────────────┐
│  Este cliente todavía no está vinculado con su carpeta del   │
│  servidor.                                                   │
│                                                              │
│  ¿Es alguna de estas?                                        │
│   ◉ S. PRIVADO\COINREFRI                    (parecido 92 %)  │
│   ○ S. PRIVADO\COINREFRI SRL 2019           (parecido 71 %)  │
│   ○ Ninguna de estas — buscar otra…                          │
│                                     [Vincular esta carpeta]  │
└──────────────────────────────────────────────────────────────┘
```
- Las sugerencias salen de la tabla `carpetas_servidor` (§3) por similitud de
  trigramas contra la razón social **y el nombre comercial** (`pg_trgm` ya está
  instalada; y la lección COINREFRI aplica: el nombre de la carpeta puede ser
  el comercial, no la razón social).
- Vincular escribe `cuentas.carpetas_servidor` (§3) con una actividad de
  auditoría no — con updated_at basta; no ensuciar la gestión.
- Quién puede vincular: cualquier usuario del CRM que vea la ficha. Es
  reversible («Cambiar carpeta» chiquito una vez vinculada).

### V2 · «Informes de esta máquina» en la ficha del equipo

En `/postventa/equipos/[id]`: un botón `[Abrir informes de esta serie ↗]` que
abre la carpeta de informes del cliente **ya filtrada**: el `/carpeta` acepta
`?q=<serie>` y filtra por nombre de archivo en el servidor. Si el equipo no
tiene cuenta vinculada, no se muestra.

### V3 · Los presupuestos históricos (la mudanza de R2)

`src/app/api/cotizaciones-historicas/[id]/pdf/route.ts` hoy firma contra R2.
Cuando los 1.670 MB estén copiados al servidor (script de mudanza §4), la ruta
prueba primero el servidor (`enlaceFirmado` sobre la ruta local guardada) y cae
a R2 si no está — **la mudanza no puede romper ni un enlace mientras dura**.
R2 se apaga recién cuando el conteo diga que los 5.498 están.

### V4 · Fase 2, con certificado (NO construir todavía — solo dejar el lugar)

Cuando Sistemas ponga `archivos.efameinsa.com` + certificado: el mismo panel V1
pasa de botones a contenido incrustado — miniaturas de fotos en grilla, la
lista de informes dentro de la ficha (el JSON de `/carpeta` ya existe), y el
`ARCHIVOS_URL` cambia de `http://IP:puerto` a `https://archivos.efameinsa.com`.
Nada del diseño de fase 1 se tira: los botones quedan como respaldo.

---

## 3 · Los datos que faltan (migración 0134 — la siguiente libre)

```sql
-- El índice de carpetas del servidor: solo NOMBRES de carpeta, nunca archivos.
create table carpetas_servidor (
  ruta        text primary key,          -- p. ej. X:\S. PRIVADO\COINREFRI
  nombre      text not null,             -- COINREFRI
  clase       text not null check (clase in ('informes','fotos','videos','fichas')),
  actualizado_at timestamptz not null default now()
);
-- Lectura para todos los autenticados; escritura solo service_role (el script).

alter table cuentas add column carpetas_servidor jsonb;
-- { "informes": "X:\\S. PRIVADO\\COINREFRI", "fotos": "W:\\COINREFRI" }
```

**Por qué un índice en la base:** Vercel no ve la LAN, así que las sugerencias
de vinculación no pueden listar carpetas en vivo. El índice lo llena
`scripts/indexar-carpetas-servidor.mjs` (crearlo: recorre solo el PRIMER nivel
de S. PRIVADO, S. PUBLICO y la raíz de fotos — son ~250 carpetas de cliente—,
upsert por ruta, borra las que ya no existen). Se corre desde una máquina de la
oficina; anotar en el propio script que hay que refrescarlo cuando Lesly cree
carpetas nuevas, y que tarda segundos.

## 4 · La mudanza de R2 (script, sin apuro)

`scripts/mudar-r2-al-servidor.mjs`: baja los 5.498 PDF (1.670 MB) del bucket a
una carpeta nueva del servidor (`…\CRM\COTIZACIONES HISTORICAS\<año>\`), guarda
la ruta local en `cotizaciones_historicas` (columna nueva en la 0134:
`pdf_ruta_servidor text`), verifica el tamaño de cada archivo contra el origen,
y NO borra nada de R2. Con ensayo y `--aplicar`, como todos los scripts del
repo. A 2,2 MB/s de bajada + LAN, estimar ~40 min: correrlo fuera de horario.

## 5 · Orden sugerido de ejecución

1. Migración 0134 + script indexador + correrlo (necesita esta máquina).
2. V1 (panel + vincular) — es la vista que gerencia va a querer ver.
3. V2 (equipos) — 30 minutos encima de V1.
4. Script de mudanza de R2 + V3 con su caída a R2.
5. V4 queda para cuando Sistemas confirme el certificado.

**Dependencia externa:** nada de esto se ve en producción hasta que Sistemas
levante el servicio y pase el puerto (→ `ARCHIVOS_URL` en Vercel y en
`.env.local`). Se puede construir y probar TODO contra el servicio local de
esta máquina (puerto 8099, secreto de prueba — ver los `_tmp-probar-*` citados
en el historial del repo).

## 6 · Verificación final

1. Con la sesión real de un comercial: vincular COINREFRI a su carpeta,
   abrir informes, fotos y un video. Medir que abre en <2 s por LAN.
2. La sugerencia de carpeta acierta para 8 de 10 clientes con carpeta (probar
   con nombres torcidos: «AGUILAR ANCO VDA DE ROSELL» vs «ROSSELL» existe).
3. Un enlace vencido muestra el mensaje del servicio, no un error pelado.
4. Desde fuera de la oficina (simular: ARCHIVOS_URL inválida) el panel dice
   «solo desde la oficina» y nada se cuelga.
5. Histórico R2: 20 cotizaciones al azar abren igual antes y después de mudar.
