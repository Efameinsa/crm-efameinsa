-- ═══════════════════════════════════════════════════════════════════════════
-- 0524 · LO QUE SE CORRIGE EN LA FICHA LLEGA AL PEDIDO
-- ═══════════════════════════════════════════════════════════════════════════
-- Buzón 06–16/10: cuatro veces se corrigió el nombre o el RUC en la ficha del
-- cliente y el pedido, el caso o la máquina siguió diciendo lo de antes
-- (NESSUS HOTELES en el pedido de Pucallpa, la UNIMAC de HANCO HUILLCA, el
-- PED de Piscis), y hubo que cambiarlo a mano en la base. Santos, 17-10:
-- «¿por qué no ves algo para corregir?».
--
-- La causa: el pedido (servicios_postventa), el caso (atenciones), la
-- máquina (equipos_instalados) y el informe de servicio guardan el cliente
-- en texto (`cliente_texto`) el día que nacen, y nada lo refresca.
--
-- Ahora, cuando cambia la razón social o el documento de la ficha, el texto
-- se pone al día solo en lo que todavía está vivo:
--   · pedidos sin terminar (completado = false)
--   · casos sin cerrar
--   · todas las máquinas de la ficha (es el dueño de hoy)
--   · informes de servicio todavía no emitidos
-- Lo que ya salió (informes emitidos, pedidos terminados) se queda como se
-- entregó. El cierre tampoco se toca: su «Se le factura a» puede ser a
-- propósito otra empresa del grupo, y tiene su propio «Editar».
--
-- Se respeta la forma del texto: si decía «RUC - NOMBRE», sigue así con los
-- datos nuevos. Corre dentro del mismo clic, así que «Deshacer este clic»
-- (0513) también lo revierte.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.texto_cliente_al_dia(p_viejo text, p_cuenta cuentas)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_viejo, '') ~ '^\d{8,11}\s*-\s*' and coalesce(btrim(p_cuenta.num_doc), '') <> ''
      then btrim(p_cuenta.num_doc) || ' - ' || p_cuenta.razon_social
    else p_cuenta.razon_social
  end;
$$;

create or replace function public.propagar_datos_del_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fusionada_en is not null then return new; end if;
  if new.razon_social is not distinct from old.razon_social
     and new.num_doc is not distinct from old.num_doc then
    return new;
  end if;
  if coalesce(btrim(new.razon_social), '') = '' then return new; end if;

  update servicios_postventa s
     set cliente_texto = texto_cliente_al_dia(s.cliente_texto, new)
   where s.cuenta_id = new.id
     and not s.completado
     and s.cliente_texto is distinct from texto_cliente_al_dia(s.cliente_texto, new);

  update atenciones a
     set cliente_texto = texto_cliente_al_dia(a.cliente_texto, new)
   where a.cuenta_id = new.id
     and a.cerrado_at is null
     and a.cliente_texto is distinct from texto_cliente_al_dia(a.cliente_texto, new);

  update equipos_instalados e
     set cliente_texto = texto_cliente_al_dia(e.cliente_texto, new)
   where e.cuenta_id = new.id
     and e.cliente_texto is distinct from texto_cliente_al_dia(e.cliente_texto, new);

  update informes_servicio i
     set cliente_texto = texto_cliente_al_dia(i.cliente_texto, new)
   where i.cuenta_id = new.id
     and i.emitido_at is null
     and i.cliente_texto is distinct from texto_cliente_al_dia(i.cliente_texto, new);

  return new;
end $$;

drop trigger if exists zx_propagar_datos_del_cliente on public.cuentas;
create trigger zx_propagar_datos_del_cliente
  after update of razon_social, num_doc on public.cuentas
  for each row execute function public.propagar_datos_del_cliente();

revoke all on function public.propagar_datos_del_cliente() from public;
