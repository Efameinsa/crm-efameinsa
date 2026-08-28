-- Por qué esta migración: reunión con gerencia del 28-08, 15:00.
--
-- Brenda emitió un cierre con el producto equivocado (una lavadora que no era
-- la apilable) y hoy el sistema no tiene forma de deshacerlo. Lo único posible
-- es borrar, que es justo lo que el ing. Carlos NO quiere:
--
--   «No, eliminar le diría que no, mejor anular nada más, que quede ahí.»
--   «Queda el registro de lo que hizo, se equivocó, cargó tres productos en
--    lugar de cuatro. Anula, queda el registro y usted tiene el número 100.
--    Luego el correlativo sigue el 101.»
--
-- Anular no es borrar: el documento se queda, con su número y su historia, pero
-- deja de contar. Es la regla del ERP que ya usan, traída tal cual.
--
-- Y no lo hace quien se equivocó: «el comercial no puede hacer absolutamente
-- nada de cambios». Anula Central o gerencia, con el código de diez minutos del
-- supervisor —el mismo mecanismo de la 0092 y la 0107— y dejando escrito por
-- qué. «Central le dirá: oye Leslie, necesito anular esto. Código, anula.»

alter table informes_cierre
  add column if not exists anulado_at timestamptz,
  add column if not exists anulado_por uuid references perfiles(id),
  add column if not exists anulado_autorizo uuid references perfiles(id),
  add column if not exists anulado_motivo text;

comment on column informes_cierre.anulado_at is
  'Cuándo se anuló. El informe sigue existiendo con su número; lo que deja de existir es su efecto (reunión 28-08).';
comment on column informes_cierre.anulado_autorizo is
  'Quién dio el código. Anular lo ejecuta Central, pero lo autoriza el supervisor.';

alter table ventas
  add column if not exists anulada_at timestamptz,
  add column if not exists anulada_motivo text;

comment on column ventas.anulada_at is
  'La venta del cierre anulado. Se anula con él: «si no lo anulas va a sumar a su record».';

-- ------------------------------------------------------------
-- El informe emitido sigue siendo inmutable. La anulación es la única marca
-- nueva que se le puede poner, y solo la pone anular_cierre(): el permiso viaja
-- en una variable de sesión que PostgREST no sabe prender, así que un UPDATE
-- directo desde el navegador —aunque las políticas lo dejaran pasar— choca con
-- el disparador igual que antes.
create or replace function bloquear_edicion_informe()
returns trigger language plpgsql as $fn$
begin
  if coalesce(current_setting('app.anulando_cierre', true), '') = 'si' then
    return new;  -- viene de anular_cierre(), que ya validó quién y con qué código
  end if;

  if old.emitido_at is not null and new.emitido_at is not null then
    if (to_jsonb(new) - 'adjuntos' - 'updated_at' - 'codigo' - 'venta_id')
       is distinct from (to_jsonb(old) - 'adjuntos' - 'updated_at' - 'codigo' - 'venta_id') then
      raise exception 'El informe % ya fue emitido y no se modifica', old.codigo;
    end if;

    if old.venta_id is not null and new.venta_id is distinct from old.venta_id then
      raise exception 'El informe % ya está atado a su venta y no se cambia', old.codigo;
    end if;

    if not (new.adjuntos @> old.adjuntos) then
      raise exception 'Del informe % los documentos solo se agregan: uno ya adjuntado no se quita ni se reemplaza', old.codigo;
    end if;
  end if;
  return new;
end;
$fn$;

-- ------------------------------------------------------------
-- Lo que hay que mirar ANTES de pedir el código. Un cierre que ya se ejecutó en
-- el ERP y está en manos de postventa se puede anular igual —esa es la razón de
-- ser de esto, que el error se descubre después—, pero quien anula tiene que
-- saber que alguien está despachando esa máquina.
create or replace function cierre_en_juego(p_informe uuid)
returns table (codigo text, cliente text, monto numeric, moneda text, anulado boolean,
               tiene_venta boolean, pedido_erp text, ejecutado boolean, en_postventa boolean)
language sql stable security definer set search_path = public as $fn$
  select i.codigo, i.cliente_nombre, i.monto_total, i.moneda,
         i.anulado_at is not null,
         i.venta_id is not null,
         s.numero_pedido_erp,
         s.pedido_ejecutado_at is not null,
         s.aprobado_at is not null
    from informes_cierre i
    left join servicios_postventa s on s.informe_cierre_id = i.id
   where i.id = p_informe
   limit 1;
$fn$;

revoke all on function cierre_en_juego(uuid) from public;
grant execute on function cierre_en_juego(uuid) to authenticated;

-- ------------------------------------------------------------
create or replace function anular_cierre(p_informe uuid, p_motivo text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien uuid := auth.uid();
  v_rol text;
  v_autorizo uuid;
  v_inf record;
  v_cuenta uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select rol::text into v_rol from perfiles where id = v_quien and activo;
  if v_rol is null or v_rol not in ('central', 'gerencia', 'admin') then
    raise exception 'Anular un cierre lo hace Central o gerencia, no quien lo emitió';
  end if;

  if length(coalesce(btrim(p_motivo), '')) < 10 then
    raise exception 'Escriba por qué se anula: queda en el registro del informe';
  end if;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre todavía es un borrador del comercial: no hay nada que anular';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'El cierre % ya estaba anulado', v_inf.codigo;
  end if;

  -- El banco de pruebas y la operación real no se cruzan, tampoco por acá: la
  -- Central de verdad no anula un cierre de práctica ni al revés.
  if v_inf.es_prueba is distinct from es_cuenta_prueba() then
    raise exception 'Ese cierre no es de esta cuenta';
  end if;

  -- El código va acá, al final de todas las verificaciones: un código quemado
  -- por un intento que igual iba a fallar obliga al supervisor a dictar otro.
  v_autorizo := validar_pin_supervisor(p_pin);

  perform set_config('app.anulando_cierre', 'si', true);

  update informes_cierre
     set anulado_at = now(), anulado_por = v_quien,
         anulado_autorizo = v_autorizo, anulado_motivo = btrim(p_motivo)
   where id = p_informe;

  if v_inf.venta_id is not null then
    update ventas
       set anulada_at = now(), anulada_motivo = btrim(p_motivo)
     where id = v_inf.venta_id;

    -- «Última venta» de la cuenta manda en las reglas de cartera, así que no
    -- puede seguir apuntando a una venta que ya no existe para el negocio.
    select o.cuenta_id into v_cuenta
      from ventas v join oportunidades o on o.id = v.oportunidad_id
     where v.id = v_inf.venta_id;
    if v_cuenta is not null then
      update cuentas c
         set ultima_venta_at = (
           select max(v.fecha_venta)
             from ventas v join oportunidades o on o.id = v.oportunidad_id
            where o.cuenta_id = c.id and v.anulada_at is null)
       where c.id = v_cuenta;
    end if;
  end if;

  perform set_config('app.anulando_cierre', '', true);

  return jsonb_build_object(
    'codigo', v_inf.codigo,
    'serie', v_inf.serie,
    'cliente', v_inf.cliente_nombre,
    'venta_anulada', v_inf.venta_id is not null
  );
end;
$fn$;

comment on function anular_cierre is
  'Anula un cierre emitido: queda el documento y su número, deja de contar. Ejecuta Central o gerencia con el código del supervisor y un motivo escrito (reunión 28-08). No hay vuelta atrás: si se anuló por error, el comercial emite uno nuevo, que es exactamente lo que hace el ERP.';

revoke all on function anular_cierre(uuid, text, text) from public;
grant execute on function anular_cierre(uuid, text, text) to authenticated;
