-- 0379 — EL INFORME ENVIADO AL CLIENTE SE PRUEBA CON SU CONSTANCIA
--
-- Reunión de postventa del 02-10 12:25. Carlos: «no solamente marcar, porque
-- pueden marcar que ya se envió… que suban la constancia de que ya se le
-- envió al cliente, así como la confirmación de abono». Hasta hoy «Guardar y
-- marcar enviada al cliente» era un clic sin evidencia.
--
-- Se reemplaza la función (no se agrega otra firma: dos firmas rompen
-- PostgREST). Marcar enviada pide la constancia: la ruta del archivo ya subido
-- a `adjuntos`, bajo aperturas/<id>/. Lo enviado antes de hoy queda como está.

alter table public.aperturas_llamada
  add column if not exists constancia_envio_path text;

drop function if exists public.revisar_apertura_llamada(uuid, text, boolean);

create or replace function public.revisar_apertura_llamada(
  p_id uuid, p_informe_cliente text, p_enviada boolean default false, p_constancia text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a aperturas_llamada%rowtype;
  v_constancia text := nullif(btrim(coalesce(p_constancia, '')), '');
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La revisión es de postventa';
  end if;
  select * into a from aperturas_llamada where id = p_id and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found or a.anulada_at is not null then raise exception 'Esa apertura no existe o está anulada'; end if;
  if a.informe_at is null then raise exception 'El almacén todavía no subió su informe'; end if;
  if nullif(btrim(coalesce(p_informe_cliente, '')), '') is null then raise exception 'Falta el texto para el cliente'; end if;
  if v_constancia is not null and v_constancia not like 'aperturas/' || p_id::text || '/%' then
    raise exception 'La constancia no corresponde a esta llamada';
  end if;
  if p_enviada and a.enviada_cliente_at is null and v_constancia is null then
    raise exception 'Suba la constancia del envío (el correo o la captura del WhatsApp al cliente)';
  end if;
  update aperturas_llamada
     set informe_cliente = btrim(p_informe_cliente),
         revisada_at = coalesce(revisada_at, now()),
         revisada_por = coalesce(revisada_por, auth.uid()),
         enviada_cliente_at = case when p_enviada then coalesce(enviada_cliente_at, now()) else enviada_cliente_at end,
         constancia_envio_path = coalesce(v_constancia, constancia_envio_path)
   where id = p_id;
  if a.servicio_id is not null and a.tipo = 'videollamada_preinstalacion' then
    update servicios_postventa
       set preinstalacion_ok_at = coalesce(preinstalacion_ok_at, now()),
           preinstalacion_nota = case
             when preinstalacion_nota is null
               or preinstalacion_nota = left(btrim(coalesce(a.informe_cliente, '')), 500)
               or preinstalacion_nota = btrim(coalesce(a.informe_cliente, ''))
             then btrim(p_informe_cliente) else preinstalacion_nota end,
           updated_at = now()
     where id = a.servicio_id;
  end if;
end $$;

grant execute on function public.revisar_apertura_llamada(uuid, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';

insert into _migraciones_aplicadas (archivo) values ('0379_informe_enviado_con_constancia.sql')
on conflict do nothing;
