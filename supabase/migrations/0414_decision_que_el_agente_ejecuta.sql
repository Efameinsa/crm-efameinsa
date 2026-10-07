-- 0414 · La nota de «Esperan tu decisión» puede ser una ORDEN para el agente
-- (Santos, 07-10-2026): en vez de abrir la consola de Claude, el admin escribe
-- qué se decidió, marca «que el agente lo ejecute» y el vigilante del buzón lo
-- toma, lo hace y deja aquí el resultado.

alter table public.pendientes_decision
  add column if not exists ejecutar boolean not null default false,
  add column if not exists ejecutado_at timestamptz,
  add column if not exists resultado text;

create index if not exists pendientes_decision_por_ejecutar
  on public.pendientes_decision (resuelto_at) where ejecutar and ejecutado_at is null;

-- Katerine (07-10): el asesor no podía unir a su cliente un RUC que ya estaba en la
-- cartera de otro comercial (0326 lo frena: «lo autoriza gerencia») y no había
-- cómo pedirlo. Ahora lo pide desde el botón y le cae a gerencia en «Esperan tu
-- decisión»; con «Que el agente lo ejecute» queda hecho.
create or replace function pedir_union_razon_social(p_cuenta uuid, p_num_doc text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc text := regexp_replace(coalesce(p_num_doc, ''), '[^0-9]', '', 'g');
  v_madre cuentas%rowtype;
  v_otra cuentas%rowtype;
  v_quien text;
  v_de text;
begin
  select * into v_madre from cuentas where id = (select coalesce(cuenta_padre_id, id) from cuentas where id = p_cuenta);
  if v_madre.id is null then raise exception 'Ese cliente no existe'; end if;
  if not (v_madre.comercial_id = auth.uid() or coalesce(es_backoffice(), false)) then
    raise exception 'Esto lo pide el comercial dueño del cliente';
  end if;
  select * into v_otra from cuentas where num_doc = v_doc and fusionada_en is null order by created_at limit 1;
  if v_otra.id is null then raise exception 'Ese RUC no tiene ficha: se crea directo con «Vincular»'; end if;
  select nombre into v_quien from perfiles where id = auth.uid();
  select nombre into v_de from perfiles where id = v_otra.comercial_id;
  if exists (select 1 from pendientes_decision where resuelto_at is null and detalle like '%' || v_otra.id::text || '%' and detalle like '%' || v_madre.id::text || '%') then
    raise exception 'Ese pedido ya está con gerencia';
  end if;
  insert into pendientes_decision (titulo, detalle)
  values (
    format('%s pide unir %s (RUC %s) al grupo de %s', coalesce(v_quien, 'Un comercial'), v_otra.razon_social, v_doc, v_madre.razon_social),
    format(E'La ficha %s (cuenta %s) está en la cartera de %s. Unirla al grupo de %s (cuenta %s, cartera de %s) la pasa a la cartera de %s: cuelga de la madre con cuenta_padre_id, se pasan sus expedientes, se anota la reasignación (decision_gerencia) y se deja un expediente abierto para cotizar. Mismo procedimiento que ROJAS PLAZA / ROJAS INN del 07-10.',
      v_otra.razon_social, v_otra.id, coalesce(v_de, 'nadie'), v_madre.razon_social, v_madre.id,
      coalesce((select nombre from perfiles where id = v_madre.comercial_id), 'nadie'), coalesce(v_quien, 'quien lo pidió'))
  );
end $$;

grant execute on function pedir_union_razon_social(uuid, text) to authenticated;

insert into _migraciones_aplicadas (archivo) values ('0414_decision_que_el_agente_ejecuta.sql')
on conflict do nothing;
