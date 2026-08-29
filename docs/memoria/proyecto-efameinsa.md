---
name: proyecto-efameinsa
description: "Proyecto activo — migración del sitio efameinsa.com de OpenCart a Astro 7; repo github.com/soyhank/efameinsa, clon local en C:\\Users\\diseno\\Projects\\efameinsa"
metadata: 
  node_type: memory
  type: project
  originSessionId: af629173-41b8-4628-aeee-be003573e9e6
  modified: 2026-08-11T19:04:26.127Z
---

Darwin trabaja en la renovación del sitio web de Efameinsa S.A. (equipos de lavandería industrial, Perú). Migración de OpenCart a Astro 7 + Vercel conservando el esquema de URLs posicionado en Google.

- **Repo:** https://github.com/soyhank/efameinsa (usuario de GitHub: `soyhank`, rama `master`)
- **Clon local:** `C:\Users\diseno\Projects\efameinsa` (clonado el 2026-08-11; el repo se creó el 2026-08-10 en una sesión web/cloud de Claude Code, por eso no existía copia local)
- Comandos: `npm run dev`, `npm run build`, `npm run verificar` (cobertura de 487 URLs antiguas — verificado OK el 2026-08-11)
- El 2026-08-10 se hicieron análisis de competencia/SEO y el plan de renovación (artifacts: efameinsa-analisis-seo, efameinsa-plan-renovacion-web)
- No considerar web.efameinsa.com (subdominio de prueba, se eliminará; está indexado por error — pedir noindex/eliminación)

**Manual de marca** (`C:\Users\diseno\Downloads\Manual de marca efameinsa.pdf`, 36 págs; renderizado a PNG en scratchpad): colores Granate #7E1210, Negro #000000, Gris #6B6B6B, Blanco; tipografía LG Smart (integrada el 2026-08-11: TTFs de `Downloads\lg-smart` convertidos a WOFF2 en `public/fonts/`, @font-face en global.css, preload en Base.astro); la marca se escribe "Efameinsa" (nunca EFAMEINSA ni efameinsa); voz: tono corporativo e informativo, usted + primera persona plural, sin exceso de signos ni emoticones, "y" en vez de "&".

**Lineamientos de la reunión con gerencia** (`Downloads\REUNION.txt`, 2026-08-10): la empresa tiene 26 años de mercado (fundación 2000); pilares a comunicar: fabricantes con planta propia + representantes oficiales (UniMac, Primus, Girbau, ADC, Milnor, GMP) + stock en showroom para entrega inmediata + servicio técnico propio; problema clave: leads "domésticos" (línea blanca) contaminan las campañas — la web debe filtrarlos (no venden línea blanca; línea mínima semi industrial 13 kg); oportunidad: campaña de barrera sanitaria para sector salud antes que la competencia; el formulario web venía cayendo en leads — es prioridad; la web debe verse bien en celular (no una imagen a pantalla completa).

El 2026-08-11 se aplicó la re-paleta completa (marino/coral → granate/gris del manual), corrección de expresión textual y voz, diferenciador de entrega inmediata en portada y nota de filtro doméstico en el formulario. Commit `8252293` pusheado a master.

Portada con HeroSlider (piezas LG Titan/Primus/GMP/SIDI en `public/img/hero/`), tarjetas de sector con imagen, y galería "Proyectos" con pestañas (5 proyectos hospitalarios: INEN, EsSalud Pasco, Regional Cusco, Hospital II Abancay, Virgen de la Puerta — fotos del sitio antiguo corregidas en `public/img/proyectos/`); `/proyectos` es página propia (galería + alcance "Lo que hicimos" + CTA de licitaciones) enlazada en el nav; la portada tiene un puente compacto. Favicon: isotipo oficial extraído en vectores de la pág. 6 del manual (PNG 32/192/apple-touch en `public/`). Limpieza pendiente: categoría `secadoras-industriales-en-venta-lima-peru` duplicada en catalogo.json (warning de build inofensivo) y tuteo residual en descripciones de catalogo.json.

**Vercel**: proyecto `efameinsa` bajo el scope `soyhanks-projects` (no el team dsva97 del MCP), conectado al repo GitHub — cada push a master despliega solo. Producción: https://efameinsa.vercel.app. CLI logueada en esta máquina; la red requiere `NODE_OPTIONS=--dns-result-order=ipv4first` (IPv6 roto). Dominios www.efameinsa.com y efameinsa.com ya agregados al proyecto; **pendiente el cambio de DNS en im-global.net** (hosting actual del OpenCart): `A www 76.76.21.21` y `A @ 76.76.21.21` — ese cambio hace el cutover del sitio viejo al nuevo, coordinar con gerencia/programador.

**Plan de marketing B2B** (2026-08-11): artifact en https://claude.ai/code/artifact/dcd7d6a9-ae24-4b8f-abb1-7fd4998feb9f — 6 pilares: P1 medición/CRM (SQL, conversiones offline, dashboard), P2 Google Search por sector, P3 contenido técnico + LinkedIn, P4 ABM lista de 150 cuentas + showroom, P5 barrera sanitaria + SEACE/licitaciones, P6 WhatsApp calificador + nurturing. Contexto: leads Meta a S/1 son domésticos (línea blanca); se retira el CPL como métrica; roadmap 90 días. **Plan de contenidos** (anexo): https://claude.ai/code/artifact/549e8158-2a37-4480-b9e0-06d0dd59c1fd — LinkedIn principal, YouTube segundo, FB/IG con derivadas, TikTok no; 5 familias (casos, técnico, producto en acción, sector en foco, fábrica); grilla de 4 posts/semana desde 1 pieza madre mensual.

**Presentación para gerencia** (2026-08-11): https://claude.ai/code/artifact/bfa81b48-b673-4e78-9a90-588e23049004 — 20 diapositivas (v2): plan de marketing completo con las 4 realidades de compra, 3 puertas de entrada, cada pilar en su lámina, mix, plan de contenidos (canales + familias + grilla) y decisiones. Dato clave nuevo: **Google Ads gastó S/ 35,926 en 12 meses (ago 2025–ago 2026) con 3,389 conversiones sin definición auditada (S/10.60/conv, CPM S/139, display incluido)** vs Meta S/ 4,032 — el 90% de la inversión está en Google. Google mejoró solo: +1,994 conversiones con S/-17,448 de gasto. Pendientes críticos: cruce con CRM, auditoría de conversiones de Google, NO aceptar migración Display→Gen. demanda a ciegas. Pide 4 decisiones: definición SQL, acceso CRM, congelar Gen. demanda, fecha de cutover DNS.

**Dashboard Meta Ads** (P1 del plan): https://efameinsa-ads.vercel.app — Next.js 15 en `C:\Users\diseno\Projects\efameinsa-ads` (proyecto Vercel `efameinsa-ads`, scope soyhanks-projects, deploy directo por CLI sin GitHub). Clave de acceso: env `DASHBOARD_PASSWORD` ("Efameinsa2026"). En modo demo hasta configurar `META_ACCESS_TOKEN` y `META_AD_ACCOUNT_ID` (token de usuario del sistema con permiso ads_read desde Business Manager). Colores de gráfico validados: #b04840 claro / #d0645e oscuro. Conectado 2026-08-11 con token permanente de usuario del sistema "ReporteAnuncios" (permiso ads_read, app id 1784637302716988) sobre cuenta real "Efameinsa CP" (act_24045076571827202) — gasto histórico ~S/4,190, último año S/4,032 con costo por resultado de S/1.60 (confirma la sospecha de leads baratos). Eje X: diario para 30d, semanal (lunes-domingo) para 90d/12m. Contenedor ancho 88rem.

Ver [[entorno-windows-darwin]].
