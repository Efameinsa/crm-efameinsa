-- LA HOJA DE CHEQUEO DEL PROTOCOLO EN LA TABLET (Ariana, almacén, 13-10).
--
-- El papel «PROTOCOLO DE LAVADORA» (estructura, componentes, funcionamiento
-- en vacío y con carga, programación, observaciones y firmas) pasa al CRM tal
-- cual, con casillas para marcar ✓ / ✗: «vamos a tener una tablet para
-- solamente darle check… para ya no estar poniéndolo manualmente». Va al
-- final del mismo informe de protocolo de la máquina.
--
-- Un chequeo por máquina, como los datos de la hoja (0417): «principal» es la
-- del renglón y «secadora» la de una torre sin renglón propio. El contenido lo
-- define la plantilla en src/lib/protocolo-checklist.ts; aquí solo se guarda
-- lo marcado, con tope de tamaño.
--
-- Queda bajo el mismo candado de la 0450: con la máquina ya probada y
-- embalada, cambiar el chequeo pide el código de Lesly.

alter table public.pedido_equipos add column if not exists protocolo_chequeo jsonb not null default '{}'::jsonb;

create or replace function public.chequeo_del_protocolo(p_item uuid, p_maquina text, p_chequeo jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El protocolo lo llena el almacén o postventa';
  end if;
  if p_maquina not in ('principal', 'secadora') then
    raise exception 'Máquina desconocida';
  end if;
  if jsonb_typeof(p_chequeo) <> 'object' or coalesce(p_chequeo ->> 'plantilla', '') = '' then
    raise exception 'El chequeo no tiene plantilla';
  end if;
  if length(p_chequeo::text) > 20000 then
    raise exception 'El chequeo es demasiado largo: acorte las observaciones';
  end if;

  update pedido_equipos
     set protocolo_chequeo = jsonb_set(coalesce(protocolo_chequeo, '{}'::jsonb), array[p_maquina],
                                       p_chequeo || jsonb_build_object('guardado_at', now(), 'guardado_por', auth.uid()))
   where id = p_item and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa máquina no está en el pedido'; end if;
end $$;

revoke all on function public.chequeo_del_protocolo(uuid, text, jsonb) from public, anon;
grant execute on function public.chequeo_del_protocolo(uuid, text, jsonb) to authenticated;

-- El candado de la 0450, ahora también sobre el chequeo.
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
     and new.protocolo_chequeo is not distinct from old.protocolo_chequeo
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
