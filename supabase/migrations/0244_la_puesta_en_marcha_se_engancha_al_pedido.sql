-- ============================================================
-- CRM EFAMEINSA · Migración 0244 · La puesta en marcha se engancha al pedido
-- ============================================================
-- Carlos, 15-09: «tiene que ser relacionado con el cliente máster… vamos a
-- suponer que ya está el pedido, está todo, pero mi proceso todavía está
-- pendiente. Esa llamada, así le pongo puesta en marcha, tiene que ingresar
-- acá para yo continuar con mi proceso». Caso PACHA NAN SAMAY (16-09): el
-- equipo salió el 05-09 en un pedido que sigue en «Puesta en marcha y
-- cierre»; el cliente lo instaló solo, vibra, y Central lo registró como
-- problema técnico. Hasta hoy la atención de puesta en marcha y el pedido no
-- se conocían: se programaba al técnico en una y el otro seguía diciendo
-- «falta la puesta en marcha».
--
-- Regla: una atención de tipo puesta_en_marcha se cuelga del pedido vivo de
-- ese cliente (o de ese equipo) que todavía no tiene puesta en marcha. Al
-- cerrarse resuelta, el pedido queda con su fecha de puesta en marcha y la
-- máquina también. Una sola verdad, en los dos lugares.
-- ============================================================

alter table public.atenciones add column if not exists servicio_id uuid references public.servicios_postventa (id) on delete set null;
create index if not exists ix_atenciones_servicio on public.atenciones (servicio_id) where servicio_id is not null;
comment on column public.atenciones.servicio_id is 'El pedido del que esta atención es la puesta en marcha (0244).';

-- El pedido que le corresponde: por equipo si se sabe, si no el más reciente
-- del cliente que sigue sin puesta en marcha.
create or replace function public.pedido_para_puesta_en_marcha(p_cuenta uuid, p_equipo uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
    from servicios_postventa s
   where s.completado = false and s.cerrado_at is null and s.puesta_en_marcha is null
     and (
       (p_equipo is not null and exists (select 1 from equipos_instalados e where e.id = p_equipo and e.servicio_id = s.id))
       or (p_cuenta is not null and s.cuenta_id = p_cuenta)
     )
   order by (p_equipo is not null and exists (select 1 from equipos_instalados e where e.id = p_equipo and e.servicio_id = s.id)) desc,
            s.despachado_at desc nulls last, s.created_at desc
   limit 1;
$$;

-- Al nacer o al cambiar a puesta en marcha, se engancha sola.
create or replace function public.tg_atencion_engancha_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'puesta_en_marcha' and new.servicio_id is null then
    new.servicio_id := pedido_para_puesta_en_marcha(new.cuenta_id, new.equipo_id);
  end if;
  -- Y al cerrarse resuelta, el pedido y la máquina se enteran.
  if new.tipo = 'puesta_en_marcha' and new.cerrado_at is not null and (old.cerrado_at is null)
     and coalesce(new.resultado::text, '') = 'resuelto' and new.servicio_id is not null then
    update servicios_postventa
       set puesta_en_marcha = coalesce(puesta_en_marcha, (new.cerrado_at at time zone 'America/Lima')::date),
           puesta_nota = coalesce(puesta_nota, 'Puesta en marcha cerrada desde la atención ' || new.id::text || case when new.tecnico is not null then ' · ' || new.tecnico else '' end)
     where id = new.servicio_id;
    if new.equipo_id is not null then
      update equipos_instalados
         set fecha_puesta_marcha = coalesce(fecha_puesta_marcha, (new.cerrado_at at time zone 'America/Lima')::date)
       where id = new.equipo_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists atencion_engancha_pedido on public.atenciones;
create trigger atencion_engancha_pedido
  before insert or update of tipo, cerrado_at, servicio_id, equipo_id on public.atenciones
  for each row execute function public.tg_atencion_engancha_pedido();

-- Las que ya estaban abiertas como puesta en marcha, enganchadas hoy.
update atenciones a
   set servicio_id = pedido_para_puesta_en_marcha(a.cuenta_id, a.equipo_id)
 where a.tipo = 'puesta_en_marcha' and a.servicio_id is null and a.cerrado_at is null;
