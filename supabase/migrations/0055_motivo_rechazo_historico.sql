-- CRM EFAMEINSA · Migración 0055 · Motivo de rechazo genérico para el histórico
-- ============================================================
-- Bloque A (docs/10-plan-ajustes-reunion-21-08.md): la tabla `oportunidades`
-- exige motivo_rechazo_id cuando etapa='rechazada' (constraint
-- rechazo_con_motivo). Pero 6 de los códigos ESTADO del Excel que mapean a
-- 'rechazada' son justo los que el plan reserva como preguntas para Carlos
-- (§9): C4_Rdo_Futuro, C4_Rdo_DarBaja, P3_Rdo_DarBaja, P3_Rdo_Futuro,
-- H_Rdo_Futuro, H_Rdo_DarBaja — no hay forma de saber cuál de los 8 motivos
-- reales (Compró a la competencia, Precio, etc.) les corresponde sin
-- inventarlo. En vez de adivinar, se usa este motivo "cajón" que dice
-- honestamente que falta precisar — queda con activo=false para que NUNCA
-- aparezca como opción en los formularios de rechazo normales (solo lo usa
-- este import), y se puede reasignar en bloque con un solo UPDATE el día
-- que Carlos responda la pregunta #4 del plan.

insert into catalogo_motivos_rechazo (nombre, activo)
values ('Sin precisar (import histórico — ver nota de la oportunidad)', false)
on conflict (nombre) do nothing;
