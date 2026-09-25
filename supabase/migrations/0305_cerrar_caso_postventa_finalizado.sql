-- 0305 — Cerrar un caso de postventa que ya se resolvió, sin llamarlo «venta perdida».
--
-- Rubí, 25-09: el repuesto ya se despachó y quería cerrar el caso, pero la
-- única salida era «Finalizar gestión (no procede)», que pide un motivo de
-- rechazo, y todos los motivos son de venta perdida («Compró a la
-- competencia», «Solo consultaba»…). Trece casos de postventa ya estaban
-- cerrados así.
--
-- · «Proceso finalizado / despachado»: solo se ofrece en casos de postventa
--   (solo_postventa), para que un comercial no cierre un lead como «finalizado».
-- · «Otro (explicar en la nota)»: pide que la gestión diga qué pasó
--   (requiere_nota). Se ofrece solo donde hay nota: el registro de gestión.

alter table public.catalogo_motivos_rechazo
  add column if not exists solo_postventa boolean not null default false,
  add column if not exists requiere_nota boolean not null default false;

insert into public.catalogo_motivos_rechazo (nombre, activo, solo_postventa, requiere_nota)
select 'Proceso finalizado / despachado', true, true, false
 where not exists (select 1 from public.catalogo_motivos_rechazo where nombre = 'Proceso finalizado / despachado');

insert into public.catalogo_motivos_rechazo (nombre, activo, solo_postventa, requiere_nota)
select 'Otro (explicar en la nota)', true, false, true
 where not exists (select 1 from public.catalogo_motivos_rechazo where nombre = 'Otro (explicar en la nota)');
