---
name: crm-postventa-procedimiento
description: El circuito completo de postventa (venta→central→finanzas→postventa→almacén) quedó relevado el 27-08-2026 y diseñado en docs/13
metadata: 
  node_type: memory
  type: project
  originSessionId: fb84b852-7c67-4c4d-8650-efb224e74a72
  modified: 2026-08-27T13:28:07.431Z
---

Reunión del 27-08-2026 con el ing. Carlos: por primera vez se explicó el circuito completo de postventa. Diseño escrito en `docs/13-postventa-procedimiento.md` del repo `crm-efameinsa` y publicado como artifact «Circuito de Postventa».

**El circuito hoy:** comercial hace el cierre → Central pide la serie al almacén por WhatsApp, genera el pedido en el ERP e imprime el expediente → Finanzas liquida y baja el file **en papel** → recién ahí postventa arranca y lleva todo en un Excel personal (`R:\COPIA CRM POST VENTA`): prueba y embalaje, confirmación de saldo, plano de preinstalación, dirección, despacho, puesta en marcha (informe con fotos + lectura de **ciclos**, el «kilometraje» de la máquina) y cierre.

**Lo que Carlos decidió que cambie:** el cierre de venta lleva adjuntos (cotización, OC, voucher, acuerdos; la ficha RUC ya no); Central marca **«pedido ejecutado» + «liquidación»** y con eso el pedido cae solo en postventa; postventa marca **«aprobado»** como acuse; postventa ya no recibe papel.

**Bloqueo declarado:** postventa no puede cotizar en el CRM hasta que existan las **fichas de repuestos y de mantenimiento preventivo**. Mientras tanto cotiza a mano (correlativo compartido, iban por el 2185).

**FASE 1 DESPLEGADA el 27-08** (migración 0087, commits ad5135b y 1bd67cd en main): Central marca los dos checks en /central/cierres → el pedido cae en /postventa con notificación; ficha del pedido en /postventa/pedidos/[id] con los diez pasos en tres bloques y el chip de «qué lo frena»; agenda reordenada por urgencia con tres pestañas y buscador; **/postventa/equipos = parque instalado nuevo** (busca por serie, garantía calculada, ciclos). OJO: las 174 filas de servicios_postventa son origen=excel y 106 están pendientes — no filtrar la cola por origen=crm ni exigirles aprobado_at, se vacía.

**El manual (87 pág.) respondió dos preguntas:** garantía = 24 meses; preventivo cada 4-6 meses. Aportó además la APERTURA (orden de trabajo), los 8 tipos de servicio, el protocolo de pruebas y los 5 formatos de informe (anexos 1-5). Extraído a texto con pdfjs-dist porque no hay poppler en esta máquina.

**Preguntas abiertas** (listadas en el §9 del doc): desde cuándo corre la garantía en Lima y cuántos meses; si se puede despachar sin cancelación y quién autoriza; si el almacén y Finanzas tendrán usuario en el CRM. El manual ya lo pasó Santos (Downloads/«FUNCIONES POST VENTA.docx 2025.pdf»).

Relacionado: [[proyecto-crm-efameinsa]], [[fuente-de-precios-crm]].

**Aparte, de la misma reunión:** las fichas técnicas ya **no** se reportan a Importaciones — se copia una ficha existente, se modifica y al terminar se le pasa a Santos; Importaciones solo queda copiado por procedimiento.

**Reunión 27-08 TARDE (transcripciones 14.28/14.58/15.29 de Descargas) → diseño UX en `docs/16-postventa-ux-flujo.md` del repo.** Decisiones de Carlos: Ariana no ejecuta (quitarle agenda/equipos/soporte del nav — hoy `nav-lateral.tsx:109` se las suma); Hever ve todo, gestor comercial solo lo suyo; ni postventa ni almacén ven precios (sí estado de pago, tapado en servidor); timeline del comercial desde la asignación; agenda de despachos → calendario semanal de atenciones técnicas; serie = eje de trazabilidad; correlativo único (Ariana manda 4 cotizaciones desde la 286 a mano). **Postventa baja de prioridad: manda marketing**; nada de almacén/finanzas hasta después de la reunión del ERP (EJB) del **viernes 28-08 4pm** con el proveedor — el módulo comercial del ERP trae logística/pedidos/facturación/cobranzas y hay riesgo de duplicidad. Ejecución por paquetes A→D del §9 del doc 16. Aparte: Carlos cierra el grupo de WhatsApp (reclamos por correo), mudanza de sitio el sábado, Lesly debía enviar formatos de informes + planos + fichas de repuestos/mantenimiento.

**28-08 — LOS CUATRO PAQUETES DEL PLAN 16, DESPLEGADOS** (commits 2e0f309, e119d8a, e86baf6, 40c31b9, c4357f6 en main; migraciones 0096-0098). A: Ariana fuera de /postventa, precios tapados en el servidor (`sinPrecios()`/`estadoPago()`), renombres, timeline desde la asignación. B: `/postventa/agenda` es calendario semana/mes/día (semana por defecto, lunes a sábado, «por programar» arriba); la grilla se compartió con la agenda comercial en `src/lib/calendario.ts`. C: `/postventa/casos` + `/postventa/casos/nuevo` (registro guiado por serie, tres desenlaces: teléfono / derivar con texto de WhatsApp / cotizar) e informes con fotos desde la ficha de la máquina. D: `/comercial/ruta` — la campaña de Ariana, 103 clientes, gestión de un clic con el catálogo oficial de resultados. Tres bugs encontrados al construir: la ficha de equipo devolvía 404 siempre (`cuentas.documento` no existe, es `num_doc`), la cuenta de práctica no podía emitir informes (`es_prueba` con default false → 0097 lo pone la base) y postventa no encontraba al cliente que llama por primera vez (0098, abierta solo a `es_postventa()`). Verificación: `scripts/_verificar-*.mjs` (no versionados), todo contra el HTML del servidor con sesiones reales.
