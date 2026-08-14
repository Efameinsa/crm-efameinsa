# CRM Efameinsa

CRM a medida para EFAMEINSA (equipos de lavandería industrial y semi-industrial, Perú). Reemplaza el proceso actual basado en Excel (un archivo por vendedor + archivo maestro de Central). La misma empresa factura bajo dos razones sociales: **EFAMEINSA** y **OPEN** (Open Investments) — dos series de cotización separadas.

## Estado del proyecto

- **Fase actual:** arquitectura cerrada y validada con gerencia (reunión 2026-08-14). Toca ejecutar el plan de implementación.
- **Compromiso con gerencia:** piloto funcional en ~2 días desde el arranque; un avance visible al día siguiente de la reunión. Priorizar SIEMPRE lo que se ve funcionando (login → bandeja Central → vista comercial) sobre lo perfecto.
- **Plan de trabajo:** `docs/04-plan-implementacion.md` — bloques B1–B5 en orden, con criterios de aceptación. Empezar por B1.
- **Modelo de datos:** `supabase/migrations/0001_esquema_inicial.sql` es la fuente de verdad. Explicación en `docs/02-modelo-datos.md`. Reglas de negocio en `docs/03-reglas-negocio.md`.

## Stack (decidido, no rediscutir)

- **Next.js 15** (App Router, TypeScript) en `src/`
- **Supabase**: Postgres + Auth (email/password, cuentas creadas por admin) + RLS + Storage (fotos de producto, PDFs de cotización)
- **Vercel**: hosting + route handlers para webhooks (`/api/webhooks/meta`, `/api/leads`) + Vercel Cron (gasto publicitario diario, alertas)
- **Tailwind CSS + shadcn/ui** para UI rápida y consistente
- **Zod** para validación; **@react-pdf/renderer** para el PDF de cotización (server-side; NO Puppeteer en Vercel)
- Piloto: Supabase Free + Vercel Hobby. Tras aprobación: Supabase Pro ($25/mes). Presupuesto ya aceptado por gerencia.

## Reglas de negocio clave (decididas por gerencia 2026-08-14)

1. **Cartera:** un cliente pertenece al comercial que lo atendió. Si pasan **6 meses sin venta**, el cliente queda "liberable" y gerencia puede derivarlo a otro comercial (decisión manual de gerencia, no automática).
2. **Precios:** listas de precios por producto. Semi-industrial: 3 niveles (**óptimo / medio / deseado**). Industrial: lista base. El vendedor se auto-aprueba dentro de la lista; **por debajo de lista → aprobación de gerencia** (estado `pendiente_gerencia` en la cotización). ⚠️ Confirmar con gerencia cuál nivel es el piso permitido al vendedor.
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

## Entorno de esta máquina (trabajo)

- Windows 11, Node portable v24 en AppData, **sin Python ni poppler ni gh CLI**.
- PDFs se verifican renderizando con `pdfjs-dist` + `canvas` (npm) y leyendo los PNG.
- HTML→PDF de documentos: `msedge.exe --headless --print-to-pdf`.
- Repo GitHub: pendiente de crear/push (sin gh CLI: crear el repo en github.com y `git remote add` + push con credenciales del navegador).

## Integraciones (v1 tarde / v2)

- Ingesta leads: formularios web → `POST /api/leads` con token, propagando gclid/fbclid/UTM. Meta Lead Ads → webhook (requiere app review `leads_retrieval` — **iniciar trámite en semana 1**, tarda). Google Ads developer token — ídem.
- Gasto publicitario: job diario Google Ads API + Meta Marketing API → `gasto_campania` (necesario para CPL/CPA/ROAS del dashboard).
- Conversiones offline (lead bueno → Google/Meta): v2, pero la tabla `conversiones_enviadas` existe desde v1.
- Botones WhatsApp de la web: solo evento GTM, no crean lead.
