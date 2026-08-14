# 06 · Feedback de gerencia — demo del 14-08-2026

Fuente: 3 transcripciones en `Downloads/reu 14/` (demo del CRM a ing. Carlos y srta. Karen + Santos). El piloto arranca el **lunes 18-08** (Carlos autorizó tomarse un día más si hace falta: "mejor pocas observaciones que muchas").

## Recepción general
Positiva: "la idea principal está correcta", "he avanzado bastante rápido". Validaron kanban, tabla con filtros, aprobación de precios con notificación, dedup de Central ("creo que eso sí está resuelto"), cartera. Carlos y Karen se comprometieron con la visión ("queremos una reingeniería de todo").

## Decisiones que CAMBIAN acuerdos anteriores

1. **Metas SÍ entran al CRM** (antes: "fuera, lo maneja RRHH"). Piden dashboard personal del comercial tipo velocímetro: meta mensual (~$125–150 mil, hay rangos por vendedor) y % de avance. Solo metas de venta — bonos/comisiones siguen fuera.
2. **La migración histórica se ADELANTA** (antes: "al final del proyecto"). Central necesita la data antigua para saber a quién pertenece cada cliente ("cuanto más antiguo mejor" — Katerine tiene clientes de hace 6 años), y el histórico de precios por cliente es funcionalidad core (ver abajo). Cargar: Excel de TODOS los comerciales (2024–2026), el "CRM de referidos" antiguo, y la data de Central.

## Funcionalidades nuevas pedidas (por prioridad de la conversación)

### A. Histórico por CLIENTE — lo más enfatizado de toda la reunión
Dos capas:
- **Histórico narrativo de gestiones** ("descripción de estado" del Excel): el resumen acumulado 2021→2026 de todo lo conversado con un cliente, visible de un vistazo. El comercial maneja ~50 clientes al día y cruza información; un reemplazo temporal (vacaciones) debe poder leer el historial sin llamar a nadie. Hoy el historial existe por oportunidad — piden verlo consolidado **a nivel cuenta** y que el registro de gestión capture ese detalle medular (ej. "tiene 20 lavanderías, presupuesto $100k, su crédito sale el 15/09").
- **Histórico de VENTAS con precios**: si al cliente se le vendió a $15,000 el año pasado y la lista dice $10,000, cotizarle a $10,000 es "regalar $5,000". Piden ver qué compró, cuándo y a qué precio en la ficha del cliente, y un "precio recomendado por historial" visible al cotizar.

### B. Cotizaciones: inmutables + duplicar
- Una vez creada, la cotización **no se puede modificar** (les ha pasado: mismo número enviado a un cliente con dos precios distintos). Hoy ya es inmutable de facto (no hay UI de edición) — formalizarlo.
- **"Duplicar cotización"**: tomar una cotización previa como base y generar una NUEVA con nuevo correlativo. Es lo que hacen a mano hoy (copiar la 5 para hacer la 27).
- Acceso entre comerciales: debatido y concluido que **cada comercial solo ve las suyas** (como ya está). La necesidad de "ver a qué precio cotizó otro" la cubren la lista de precios + el histórico del cliente.

### C. Notificación a gerencia de CADA registro de Central
Hoy el ERP les manda un correo por cada llamada registrada y así Carlos detecta derivaciones lentas ("¿por qué nadie atiende al cliente de Buenaventura hace 3 horas?"). Exige estar informado **al registrar, antes de derivar**. El CRM no envía correos (sin servidor SMTP) — la campana/push que ya existe cubre esto con un evento nuevo (`lead_registrado` → rol gerencia). Santos también ofreció explorar aviso por WhatsApp. Pendiente decidir canal definitivo; push como mínimo viable.

### D. Búsqueda global para gerencia
Gerencia busca cualquier cliente y ve **a quién pertenece** (qué comercial) y toda su data. La RLS ya lo permite; falta la pantalla (buscador de cuentas en el rol gerencia).

### E. Visibilidad al reasignar cartera
Caso: comercial 8 se va, cliente pasa a comercial 5 → el 5 debe ver el historial de gestiones/ventas previas de ESE cliente aunque las hizo el 8. Hoy la RLS de oportunidades es por `comercial_id` de la oportunidad → el nuevo dueño NO vería lo anterior. Ajustar: el dueño actual de la cuenta ve todas las oportunidades/actividades de su cartera.

### F. Vista de ventas de gerencia
Total general del mes (para proyecciones) + clic por comercial para el desglose y % de meta. Ya existe la base; falta el drill-down y el % contra meta.

## Pendientes de DATA (los debe entregar gerencia — bloquean el piloto)
- Lista de precios oficial completa (lo cargado son ~6 productos de prueba).
- Catálogo de productos ("es inmenso", muchas variantes por modelo; apuntar al 80% de calidad; discriminar lo no autorizado).
- Excel de todos los comerciales (todos los años) + CRM referidos + data de Central → crear cuentas C1–C10 y Central reales y cargar índices.
- Los datos siguen sin entregarse; Karen dijo que darán "acceso a la data" cuando la estructura esté afinada.

## Temas administrativos / seguridad (serios, no de código)

1. **Titularidad de cuentas**: Karen (con contrato de confidencialidad de por medio) preguntó quién controla la data. La cuenta de Supabase fue creada con un correo "marketing@…" no oficial que está en otra computadora. Acordado: pasar todo a cuentas oficiales de la empresa con un **manual de credenciales** entregado a gerencia. GitHub y Vercel ya quedaron a nombre de la empresa (org "Efameinsa"); falta regularizar Supabase y documentar todo. Santos propuso además asesoría externa de seguridad para evitar conflicto de interés.
2. **Backups**: por experiencia previa (robo físico del servidor del ERP) exigen backup semanal + diario en dispositivo físico, y capacidad de restaurar en OTRA plataforma si Supabase desapareciera. → Script `pg_dump` programado + guía de restauración.
3. **Fuga de datos por comerciales**: preocupación de que un comercial descargue todo desde su laptop/celular. Estado actual ya es restrictivo (RLS por cartera, sin export masivo, solo su PDF). Documentarlo como política.
4. **Costos comunicados a gerencia**: quedó dicho "solo $25/mes de Supabase". Ojo: si Vercel pasa a Pro serían +$20/mes — corregir expectativa cuando toque.

## Fuera de alcance por ahora (anotado para v2)
- **Stock**: el comercial necesita saber qué hay para no vender sin stock; almacén maneja series; lo ideal es integrar con el **ERP nuevo (EJC, a medida, en migración)** vía API — Santos invitado a la capacitación del ERP para pedir la API de logística. Mientras tanto, cargar stock a mano requeriría un perfil dedicado → post-piloto.
- Envío de correo desde el CRM (requiere servicio de email transaccional; decidir proveedor).
- Cuentas de publicidad (Facebook pide verificación del teléfono de "Fiorella") → bloquea parte de B5.
- Evento "barreras sanitarias" (marketing, sector salud) — contexto de campañas futuras.
