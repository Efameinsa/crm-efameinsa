-- EL PROTOCOLO GUARDADO SE CORRIGE CON EL CÓDIGO DE LESLY (Ariana, almacén,
-- 13-10: «una vez que cualquier documento, protocolo, informe de prueba o
-- registro haya sido generado y guardado en el sistema, deberá quedar
-- bloqueado… si se requiere realizar alguna corrección, el sistema deberá
-- solicitar un PIN de autorización proporcionado por Lesly»).
--
-- Guardado = la máquina ya se marcó probada y embalada (prueba_lista_at).
-- Antes de eso la hoja es borrador y se completa libre. Después, cambiar sus
-- datos (0417), su fecha (0416), sus fotos y documentos (0297), su N.º de
-- protocolo o su nota pide el código de operaciones: quien lo pide da el
-- motivo, el código se quema (autorizaciones_supervisor, acción
-- 'editar_protocolo') y el informe de ese pedido queda abierto 30 minutos.
--
-- El candado es un trigger sobre pedido_equipos y no un parche en cada
-- función: así vale por cualquier puerta. No frena:
-- · operaciones, gerencia y admin (son quienes tienen el código);
-- · lo que no corre con sesión (sincronizador, scripts con service role);
-- · los 2 minutos siguientes a marcarla probada: la misma pantalla guarda
--   enseguida la fecha y el técnico (probarEquipoDelPedido).

alter table public.servicios_postventa add column if not exists protocolo_abierto_hasta timestamptz;
alter table public.servicios_postventa add column if not exists protocolo_abierto_por uuid references public.perfiles(id);
alter table public.servicios_postventa add column if not exists protocolo_abierto_motivo text;

create or replace function public.protocolo_con_candado(p_servicio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not (coalesce(es_operaciones(), false) or coalesce(es_backoffice(), false))
     and coalesce((select s.protocolo_abierto_hasta is null or s.protocolo_abierto_hasta < now()
                     from servicios_postventa s where s.id = p_servicio), true);
$$;

revoke all on function public.protocolo_con_candado(uuid) from public, anon;
grant execute on function public.protocolo_con_candado(uuid) to authenticated;

create or replace function public.protocolo_guardado_no_se_toca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if old.prueba_lista_at is null or old.prueba_lista_at > now() - interval '2 minutes' then return new; end if;
  if new.protocolo_datos is not distinct from old.protocolo_datos
     and new.protocolo_fecha is not distinct from old.protocolo_fecha
     and new.protocolo_fotos is not distinct from old.protocolo_fotos
     and new.protocolo_ref is not distinct from old.protocolo_ref
     and new.protocolo_nota is not distinct from old.protocolo_nota then
    return new;
  end if;
  if protocolo_con_candado(old.servicio_id) then
    raise exception 'El informe de protocolo ya está guardado. Para corregirlo pida el código de autorización a Lesly (operaciones).';
  end if;
  return new;
end $$;

drop trigger if exists ac_protocolo_guardado on public.pedido_equipos;
create trigger ac_protocolo_guardado
  before update on public.pedido_equipos
  for each row execute function public.protocolo_guardado_no_se_toca();

create or replace function public.abrir_protocolo_con_codigo(p_servicio uuid, p_pin text, p_motivo text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autorizo uuid;
  v_hasta timestamptz := now() + interval '30 minutes';
begin
  if not (coalesce(es_almacen(), false) or coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El protocolo lo corrige el almacén o postventa';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Diga qué hay que corregir'; end if;
  if not exists (select 1 from servicios_postventa where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false)) then
    raise exception 'Ese pedido no existe';
  end if;
  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  insert into autorizaciones_supervisor (supervisor_id, solicitante_id, ventana, accion, motivo)
  values (v_autorizo, auth.uid(), ventana_pin_actual(), 'editar_protocolo', format('Corregir el protocolo del pedido %s: %s', p_servicio, btrim(p_motivo)));
  update servicios_postventa
     set protocolo_abierto_hasta = v_hasta, protocolo_abierto_por = v_autorizo, protocolo_abierto_motivo = left(btrim(p_motivo), 300)
   where id = p_servicio;
  return v_hasta;
end $$;

revoke all on function public.abrir_protocolo_con_codigo(uuid, text, text) from public, anon;
grant execute on function public.abrir_protocolo_con_codigo(uuid, text, text) to authenticated;
