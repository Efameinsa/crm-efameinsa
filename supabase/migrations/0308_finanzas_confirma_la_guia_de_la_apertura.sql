-- 0308 · Finanzas confirma la apertura para que el almacén emita la guía (25-09).
--
-- Audio de gerencia, 25-09 14:20: «postventa emite la apertura y le sale la
-- opción enviar al almacén… no le llega la apertura» (al almacén no le sonaba
-- nada: el botón solo marcaba que el correo se había mandado a mano). «Viene
-- el segundo punto: postventa le tiene que enviar a Finanzas esa apertura para
-- que Finanzas verifique y le dé la confirmación para emitir la guía… ¿no
-- sería mejor que le llegue la alerta a Finanzas de la apertura y confirme en
-- guía? Con una notificación… para que él pueda confirmarle al almacén: ok,
-- te autorizo, emite tu guía de salida».
--
-- Lo que agrega: la confirmación de Finanzas en el pedido (quién, cuándo y
-- una nota) y la función que la registra. Los avisos van desde la aplicación.

alter table public.servicios_postventa
  add column if not exists guia_confirmada_at timestamptz,
  add column if not exists guia_confirmada_por uuid references public.perfiles (id) on delete set null,
  add column if not exists guia_confirmada_nota text;
comment on column public.servicios_postventa.guia_confirmada_at is
  'Finanzas revisó la apertura de despacho y autorizó al almacén a emitir la guía de salida (0308).';

create or replace function public.finanzas_confirmar_guia(p_servicio uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
begin
  if rol_actual()::text not in ('finanzas', 'gerencia', 'admin') and not coalesce(es_operaciones(), false) then
    raise exception 'La guía la confirma Finanzas';
  end if;
  select * into v_s from servicios_postventa
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)
   for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.apertura_despacho_at is null then raise exception 'Postventa todavía no emitió la apertura de este pedido'; end if;
  if v_s.guia_confirmada_at is not null then raise exception 'La guía de este pedido ya fue confirmada'; end if;
  update servicios_postventa
     set guia_confirmada_at = now(),
         guia_confirmada_por = auth.uid(),
         guia_confirmada_nota = nullif(btrim(coalesce(p_nota, '')), ''),
         updated_at = now()
   where id = p_servicio;
end $$;
revoke all on function public.finanzas_confirmar_guia(uuid, text) from public, anon;
grant execute on function public.finanzas_confirmar_guia(uuid, text) to authenticated;
