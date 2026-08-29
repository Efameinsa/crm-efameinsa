# CRM Efameinsa

CRM a medida para EFAMEINSA (equipos de lavandería industrial y semi-industrial, Perú). Reemplaza el proceso actual basado en Excel (un archivo por vendedor + archivo maestro de Central). La misma empresa factura bajo dos razones sociales: **EFAMEINSA** y **OPEN** (Open Investments) — dos series de cotización separadas.

## ⚠️ EMPEZAR POR ACÁ

**`docs/19-estado-y-continuidad.md`** — dónde está el sistema hoy, quién es
quién, qué quedó pendiente, cómo se trabaja y las trampas conocidas. Se lee
primero, antes de tocar nada.

## Estado del proyecto

- **EN PRODUCCIÓN Y EN USO DIARIO** desde el 25-08-2026: https://crm.efameinsa.com.
  No es un piloto. Hay comerciales cotizando, Central derivando y cierres
  emitiéndose todos los días: **cada cambio toca datos reales**.
- **El servidor local (`npm run dev`, puerto 3100) apunta a la base de
  producción.** Lo que se prueba ahí es real.
- **Modelo de datos:** las migraciones de `supabase/migrations/` son la fuente
  de verdad, en orden y con la explicación del porqué en cada cabecera.
  Panorama en `docs/02-modelo-datos.md`; reglas en `docs/03-reglas-negocio.md`.
- **Historia de las decisiones:** `docs/06`, `10`, `11`, `13`, `16`, `17`, `18`
  — cada plan salió de una reunión con gerencia y cita lo que se pidió.

## Stack (decidido, no rediscutir)

- **Next.js 16** (App Router + Turbopack, TypeScript) en `src/`
- **Supabase**: Postgres + Auth (email/password, cuentas creadas por admin) + RLS + Storage (fotos de producto, PDFs de cotización)
- **Vercel**: hosting + route handlers para webhooks (`/api/webhooks/meta`, `/api/leads`) + Vercel Cron (gasto publicitario diario, alertas)
- **Tailwind CSS + shadcn/ui** para UI rápida y consistente
- **Zod** para validación; **@react-pdf/renderer** para el PDF de cotización (server-side; NO Puppeteer en Vercel)
- Piloto: Supabase Free + Vercel Hobby. Tras aprobación: Supabase Pro ($25/mes). Presupuesto ya aceptado por gerencia.

## Reglas de negocio clave (decididas por gerencia 2026-08-14)

1. **Cartera:** un cliente pertenece al comercial que lo atendió. Si pasan **6 meses sin venta**, el cliente queda "liberable" y gerencia puede derivarlo a otro comercial (decisión manual de gerencia, no automática).
2. **Precios:** listas de precios por producto. Semi-industrial: 3 niveles (**óptimo / medio / deseado**). Industrial: lista base. El vendedor se auto-aprueba dentro de la lista; **por debajo de lista → aprobación de gerencia** (estado `pendiente_gerencia` en la cotización). ⚠️ Confirmar con gerencia cuál nivel es el piso permitido al vendedor.
   - **La única fuente de precio es `V:\LESLY\CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx`, columna «VALOR DE VENTA»** (95 equipos). Confirmado por gerencia el 25-08: *«lo que vale es la codificación de equipos para marketing que dio Lesly, esos precios se respetan»*.
   - **Las fichas .docx de `V:\` NO son fuente de precio.** De las 65, solo 4 traen una cifra escrita; el resto son plantillas con el precio en blanco (`US$ + I.G.V.`, `00,000.00`). Donde sí traen número coinciden con el maestro, salvo la **SECA758**, cuya ficha de 2023 dice 5,300 contra los 8,999 del maestro — **manda el maestro**. Si vuelve a aparecer una diferencia así, se pregunta a Lesly, no se elige la más baja.
3. **Cotización:** el formato se **rediseña** (no se replica el actual), con el manual de marca. Fotos de producto estandarizadas. Series correlativas separadas EFAMEINSA / OPEN.
4. **Acceso:** web accesible desde cualquier lugar (están migrando a laptops con esa intención). Requisito de gerencia: contraseña + **registro de accesos** (quién, cuándo, desde qué IP/dispositivo) — tabla `accesos`.
5. **Metas y bonos:** FUERA del CRM (lo maneja RRHH). El dashboard individual por vendedor gustó → idea para v2.
6. **Papel:** gerencia quiere eliminar el papel; todo el flujo interno es digital.
7. **Reportes de gerencia:** solo 2 tipos, únicamente lo relevante para decidir — no abrumar con detalle.
8. **Central:** recibe TODO contacto entrante (~50% no comercial: servicio técnico, postventa, RRHH, proveedores) → el CRM registra y deriva por área, no solo leads comerciales. Campos mínimos de Central: Santos los tiene relevados — pedírselos antes de cerrar el formulario de captura.
9. **ERP:** sistema legado a medida, SIN integración. Frontera limpia.
10. **WhatsApp:** app WhatsApp Business, sin API en v1 (links wa.me + registro rápido de gestión). API → v2.
11. **Adopción:** registrar una gestión debe tomar ≤15 segundos. PWA instalable para que "parezca programa".

## Convenciones

- Todo el dominio en **español** (tablas, columnas, rutas, UI): `cuentas`, `oportunidades`, `cotizaciones`. Código de infraestructura en inglés cuando sea idiomático.
- Correlativos: leads `PRO-####` (continúa la serie de Central), cotizaciones `Presu_###` por serie (EFAMEINSA/OPEN) — se generan con la tabla `correlativos` + función `siguiente_correlativo()`, nunca en el cliente.
- Roles: `admin`, `gerencia`, `central`, `comercial` (C1–C10). RLS: cada comercial ve SOLO su cartera; Central ve la bandeja de leads; gerencia ve todo.
- UI en español, trato de usted, marca escrita "Efameinsa" en texto corrido.

## Cómo se trabaja acá (no negociable)

- **Nada se da por bueno sin abrirlo.** El patrón de la casa son scripts
  `scripts/_verificar-*.mjs` que entran con **sesiones reales** de cada cuenta
  (magic link + `verifyOtp`), piden las páginas al servidor y afirman contra el
  HTML que devuelve — nunca contra lo que uno supone. Comprueban también quién
  NO puede hacer cada cosa.
- **Una verificación no escribe sobre datos reales.** Crea lo suyo y lo borra.
  El catálogo, los precios y las cotizaciones son del negocio.
- **Los PDF se verifican con `pdfjs-dist`**, comparando texto y dibujos página
  por página contra cotizaciones reales de referencia.
- **Antes de crear una migración, mirar el último número**: han chocado tres
  veces por trabajar dos sesiones en paralelo sobre el mismo repo.
- **Los scripts con `_` delante no se comprometen**: son de trabajo.
- **Commits en español**, explicando el porqué y citando a quien lo pidió.

## Identidad de marca (para PDF de cotización y pantallas)

- Granate `#7E1210` (primario), carbón `#2C2E35` (negro de marca digital), gris `#6B6B6B`.
- Fuente en documentos: **Arial** (decisión del usuario por legibilidad; LG Smart solo si la piden).
- Logo: `C:\Users\diseno\Downloads\PROYECTO CRM EFAMEINSA\logo-efameinsa.png` (copiar a `public/` cuando exista el scaffold).
- Documentos hacia gerencia firmados por **Santos Lenin Vilcachagua Ayala**.

## Fuentes de datos originales (para seeds y migración final)

Carpeta `C:\Users\diseno\Downloads\PROYECTO CRM EFAMEINSA\`:
- `CRM COMERCIAL5 2026-Katerine Tello.xlsx` — hoja DATOS = taxonomías (estados, acciones, intención, rubros); PROSP./COTIZ. = datos reales C5.
- `SEGUIMIENTO DE PROSPECTOS-2026.xls` — maestro de Central (11k contactos, correlativos PRO y Presu_).
- `CONSOLIDADO CIERRE VENTAS - KATERINE TELLO 2026.xlsx` — detalle de ventas y objetivos.
- **Migración histórica completa: AL FINAL del proyecto.** Día 1 solo se carga el índice mínimo de clientes (RUC/DNI + razón social + comercial de cartera) para deduplicación — script en `scripts/`.
- `scripts/extraer-catalogos.mjs` genera seeds desde la hoja DATOS (usa el paquete npm `xlsx`; pasar rutas estilo Windows `C:/...`, nunca `/c/...`).
- `scripts/seed-productos-modelos.mjs`: catálogo de ejemplo del piloto — los 4 equipos LG de las cotizaciones reales (`modelos de cotizacion/`), con características/dimensiones en `productos.ficha` y fotos en `public/productos/` (`foto_path`). Sustituir cuando gerencia entregue el catálogo y la lista de precios oficial.
- El PDF de cotización replica el formato real de ambas series (`src/lib/pdf/`): identidad por serie en `series.ts` (⚠️ cuentas bancarias de OPEN transcritas por OCR — confirmar dígitos con Santos), una página por equipo con foto + características, desglose IGV 18%.

## Entorno de esta máquina (trabajo)

- Windows 11, Node portable v24 en AppData, **sin Python ni poppler ni gh CLI**.
- PDFs se verifican renderizando con `pdfjs-dist` + `canvas` (npm) y leyendo los PNG.
- HTML→PDF de documentos: `msedge.exe --headless --print-to-pdf`.
- Repo: `https://github.com/Efameinsa/crm-efameinsa`, rama `main`.
- **Vercel: el proyecto vive en la cuenta `corporacionefameinsa.sa@gmail.com`**,
  no en la personal de Darwin. Los despliegues se miran desde ahí. Vercel
  construye siempre el commit más nuevo: si ese no compila, se congela todo lo
  que haya detrás.

## Integraciones (v1 tarde / v2)

- Ingesta leads: formularios web → `POST /api/leads` con token, propagando gclid/fbclid/UTM. Meta Lead Ads → webhook (requiere app review `leads_retrieval` — **iniciar trámite en semana 1**, tarda). Google Ads developer token — ídem.
- Gasto publicitario: job diario Google Ads API + Meta Marketing API → `gasto_campania` (necesario para CPL/CPA/ROAS del dashboard).
- Conversiones offline (lead bueno → Google/Meta): v2, pero la tabla `conversiones_enviadas` existe desde v1.
- Botones WhatsApp de la web: solo evento GTM, no crean lead.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
