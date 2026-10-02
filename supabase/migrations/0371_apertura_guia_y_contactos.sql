-- 0371 · La apertura pide la guía con su propio campo, y los contactos de contabilidad y almacén se escriben
--
-- Lesly (02-10-2026, revisando la apertura impresa de TOMY JIRO con Santos):
--
--   · «Inclusive acá necesito que le pongas en el servicio a realizar un espacio más que haya notas (…)
--     porque acá tienen que poner que se solicita una guía, ya sea para el traslado o una guía adicional
--     para llevar algunos materiales. (…) Que tenga ese campo ya para solicitar la guía.»
--     Hasta hoy la guía se escribía a mano en `apertura_nota`, cada vez con otras palabras.
--
--   · «La gestión de contabilidad (…) en este caso no es Sara, es Jhon. (…) dejar el campo para que ella
--     [lo escriba], porque puede ser variable el personal. (…) Para la coordinación con logística (…)
--     podrías poner solamente almacén, o que ellas [pongan] el número.»
--     Las filas 8, 9 y 10 llevaban nombres fijos en el código (Sara Campos, Abdías Cabezas).

alter table public.servicios_postventa
  add column if not exists apertura_guia                text,
  add column if not exists apertura_guia_detalle        text,
  add column if not exists apertura_coordina_contabilidad text,
  add column if not exists apertura_coordina_logistica    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servicios_postventa_apertura_guia_check') then
    alter table public.servicios_postventa
      add constraint servicios_postventa_apertura_guia_check
      check (apertura_guia is null or apertura_guia in ('traslado', 'materiales', 'ambas'));
  end if;
end $$;

comment on column public.servicios_postventa.apertura_guia is
  'Guía que se solicita con la apertura (0371): traslado (del equipo), materiales (guía adicional para llevar materiales) o ambas. Null = no se pide guía.';
comment on column public.servicios_postventa.apertura_guia_detalle is
  'Qué materiales lleva la guía adicional, o cualquier precisión de la guía (0371).';
comment on column public.servicios_postventa.apertura_coordina_contabilidad is
  'Con quién coordina el técnico la movilidad y los viáticos (filas 8 y 9 de la apertura): nombre y/o número. Null = quien confirmó el pago en Finanzas (0371).';
comment on column public.servicios_postventa.apertura_coordina_logistica is
  'Con quién coordina herramientas, repuestos y EPP (fila de logística de la apertura): nombre y/o número. Null = «Almacén» (0371).';
