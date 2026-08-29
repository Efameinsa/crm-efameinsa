-- ============================================================
-- CRM EFAMEINSA · Migración 0125 · Cuando el cliente no quiere equipos, quiere servicio
-- ============================================================
-- EL CASO, del 29-08. Central: «Sr. Santos, esta llamada no está en mis
-- derivados, quiero redireccionar a PV: el cliente no quiere equipos, en
-- realidad quiere mantenimiento».
--
-- El contacto era el PRO-09015 (hotel dubai / HUAYPAR DE LA CRUZ TEOFILO),
-- entrado por el formulario de Google Ads como consulta de equipos y derivado
-- a Brenda. Ella lo trabajó y anotó lo que había pasado de verdad: «se llamó a
-- cliente, no desea equipos, no tiene presupuesto ni para semi industrial,
-- desea mmto, repuestos, se le indicó que se va a derivar con postventa».
--
-- LO QUE FALTABA NO ERA UN BOTÓN DE «DERIVAR A POSTVENTA»: ese existe. Faltaba
-- el camino entre quien SE ENTERA y quien PUEDE. Se entera el comercial, al
-- teléfono con el cliente. Puede Central, que es quien deriva. Y entre los dos
-- no había nada: la decisión quedaba escrita en una nota de gestión que Central
-- no lee, y el contacto se quedaba en la cartera del comercial esperando que
-- alguien se acordara.
--
-- POR QUÉ NO SE ARREGLA REDIRIGIENDO. Redirigir mueve la oportunidad del
-- comercial a Post Venta: se llevaría por delante el trabajo de Brenda y el
-- registro de que ese cliente NO compra equipos, que es información que vale.
-- Y choca con la regla que la 0080 escribió después de que pasara cinco veces
-- en dos días: «atender una garantía no te hace el vendedor del cliente…
-- postventa es un ÁREA que atiende casos, no una cartera». Un caso de servicio
-- es una oportunidad NUEVA, no la misma cambiada de dueño.
--
-- CÓMO QUEDA. El comercial avisa desde su propia ficha; el aviso entra a la
-- bandeja de triaje como cualquier contacto —Central sigue siendo quien deriva,
-- que es la regla de Carlos del 24-08— pero llega con los datos del cliente ya
-- puestos y con la sugerencia del comercial escrita: «Post Venta ·
-- mantenimiento». Central abre el diálogo y ya está todo elegido: confirma.
--
-- Nadie vuelve a tipear un cliente que ya está en el sistema, y la decisión
-- sigue pasando por quien tiene que tomarla.

-- ------------------------------------------------------------
-- 1. La sugerencia viaja con el contacto
-- ------------------------------------------------------------
-- Son sugerencias, no órdenes: el contacto entra a la bandeja igual que
-- cualquier otro y Central puede mandarlo a donde crea. Lo que evitan es
-- retipear y adivinar.
alter table leads
  add column if not exists sugerido_a    uuid references perfiles (id),
  add column if not exists sugerido_tipo tipo_postventa,
  add column if not exists sugerido_por  uuid references perfiles (id);

comment on column leads.sugerido_a is
  'A quién propone derivarlo quien lo registró (migración 0125). Central decide igual: esto solo deja el diálogo listo.';
comment on column leads.sugerido_tipo is
  'Clase de caso de postventa que propone el comercial: garantía, repuesto o mantenimiento.';
comment on column leads.sugerido_por is
  'El comercial que avisó. Queda para poder preguntarle, y para que se vea de quién salió.';

-- ------------------------------------------------------------
-- 2. El aviso: un contacto nuevo para el mismo cliente
-- ------------------------------------------------------------
-- Se hace en la base y no desde la aplicación porque hay que leer la cuenta y
-- el contacto principal del cliente —que el comercial ve pero no puede copiar a
-- mano sin equivocarse— y porque la política de `leads` no deja a un comercial
-- insertar en la cola de triaje (0060): esto es la puerta con nombre, y valida
-- lo que tiene que valer.
create or replace function avisar_cliente_pide_servicio(
  p_oportunidad uuid,
  p_tipo        tipo_postventa,
  p_nota        text
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_quien   uuid := auth.uid();
  v_op      oportunidades;
  v_cuenta  cuentas;
  v_cont    contactos;
  v_pv      uuid;
  v_lead    uuid;
  v_codigo  text;
  v_prueba  boolean := es_cuenta_prueba();
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select * into v_op from oportunidades where id = p_oportunidad;
  if not found then raise exception 'Esa oportunidad no existe'; end if;

  -- Solo el dueño avisa de su propio cliente: es el que habló con él.
  if v_op.comercial_id <> v_quien and not es_backoffice() then
    raise exception 'Solo el comercial que atiende este cliente puede avisar que pide servicio';
  end if;

  if length(coalesce(btrim(p_nota), '')) < 15 then
    raise exception 'Escriba qué le pidió el cliente: es lo único que Central y postventa van a leer';
  end if;

  select * into v_cuenta from cuentas where id = v_op.cuenta_id;
  select * into v_cont from contactos
   where cuenta_id = v_op.cuenta_id
   order by es_principal desc, created_at
   limit 1;

  -- A quién se propone: la cuenta de postventa que corresponda al mundo
  -- (la real, o la de práctica si quien avisa está practicando).
  select p.id into v_pv from perfiles p
   where p.activo and p.es_postventa and p.rol::text = 'comercial'
     and coalesce(p.es_prueba, false) = v_prueba
   order by p.codigo_comercial
   limit 1;

  -- Un aviso sin resolver para el mismo cliente y la misma clase es el mismo
  -- aviso: avisar dos veces no crea dos casos.
  select l.id, l.codigo into v_lead, v_codigo
    from leads l
   where l.cuenta_id = v_op.cuenta_id
     and l.estado = 'pendiente_triaje'
     and l.sugerido_tipo = p_tipo
   limit 1;
  if v_lead is not null then
    return jsonb_build_object('codigo', v_codigo, 'repetido', true);
  end if;

  -- El código PRO lo pone el trigger del insert (migración 0001): generarlo acá
  -- gastaría dos números de la serie de Central por cada aviso.
  insert into leads (
    estado, area_destino, canal, fuente,
    nombre_contacto, telefono, email, num_doc, razon_social,
    mensaje, cuenta_id, recibido_por, es_prueba,
    sugerido_a, sugerido_tipo, sugerido_por
  ) values (
    'pendiente_triaje', 'comercial', 'llamada', 'aviso del comercial',
    coalesce(v_cont.nombre, v_cuenta.razon_social),
    v_cont.telefono, v_cont.email, v_cuenta.num_doc, v_cuenta.razon_social,
    btrim(p_nota), v_op.cuenta_id, v_quien, v_prueba,
    v_pv, p_tipo, v_quien
  ) returning id, codigo into v_lead, v_codigo;

  return jsonb_build_object('codigo', v_codigo, 'repetido', false, 'lead_id', v_lead);
end;
$fn$;

revoke all on function avisar_cliente_pide_servicio(uuid, tipo_postventa, text) from public;
grant execute on function avisar_cliente_pide_servicio(uuid, tipo_postventa, text) to authenticated;
