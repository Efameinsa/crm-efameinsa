-- ============================================================
-- CRM EFAMEINSA · Migración 0156 · El RUC repetido dice en qué cartera está
-- ============================================================
-- Santos, 02-09: Katerine quiso ponerle el RUC 20326700321 a una ficha y el
-- CRM la frenó. El RUC ya era de SERVICIOS TURÍSTICOS LA HOSTERÍA, en la
-- cartera de Ariana, que Katerine no ve (RLS). Santos: «cuando ocurra algo
-- así, indicar un mensajito que diga a qué comercial lo tiene en cartera,
-- por ejemplo: está en la cartera de C1».
--
-- Un comercial no puede leer las cuentas de otro, y está bien que sea así.
-- Esta función devuelve SOLO lo que hace falta para el mensaje: el código y
-- el nombre del comercial dueño del documento. Ni la razón social, ni el
-- teléfono, ni nada de la ficha ajena. Las fichas de práctica no se cruzan
-- con las reales (es_prueba, 0072).
-- ============================================================

create or replace function cartera_de_documento(p_num_doc text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $fn$
  select coalesce((
    select jsonb_build_object(
             'codigo', p.codigo_comercial,
             'nombre', p.nombre,
             'es_mia', c.comercial_id = auth.uid())
      from cuentas c
      left join perfiles p on p.id = c.comercial_id
     where c.num_doc = nullif(trim(p_num_doc), '')
       and c.tipo_doc <> 'SIN_DOC'
       and coalesce((select es_prueba from perfiles where id = c.comercial_id), false) = es_cuenta_prueba()
     order by c.created_at
     limit 1), 'null'::jsonb);
$fn$;

revoke all on function cartera_de_documento(text) from public;
grant execute on function cartera_de_documento(text) to authenticated;

comment on function cartera_de_documento(text) is
  'Código y nombre del comercial que tiene en cartera al cliente con ese RUC/DNI, para decirlo cuando alguien intenta duplicarlo (0156). No devuelve nada más de la ficha ajena.';
