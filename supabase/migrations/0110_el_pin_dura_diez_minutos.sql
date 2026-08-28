-- ============================================================
-- CRM EFAMEINSA · Migración 0110 · El código del supervisor dura diez minutos
-- ============================================================
-- Orden de Darwin, 28-08: «de ahora en adelante que sean 10 minutos la vigencia
-- del PIN».
--
-- Los dos minutos de la migración 0093 se eligieron pensando en un código que
-- se dicta y se teclea en el momento. En la práctica no pasa así: Central pide
-- la autorización, el supervisor está en una llamada o en planta, y cuando el
-- código llega ya venció. Hoy pasó otra vez —«hasta que lo recibe ya expiró»—
-- y el control terminó cediéndose por otra vía, que es justo lo que no debe
-- ocurrir: un control que estorba se termina saltando.
--
-- QUÉ NO CAMBIA, que es lo que sostiene el control:
--   · El código sigue siendo POR SUPERVISOR: se sabe cuál de los dos autorizó.
--   · Sigue QUEMÁNDOSE al usarse (restricción única sobre supervisor+ventana):
--     una autorización, una corrección.
--   · Sigue habiendo tope de 5 intentos fallidos cada 10 minutos.
--   · El motivo sigue siendo obligatorio.
--
-- LO QUE SÍ CAMBIA, y conviene tenerlo presente: como el código se quema y la
-- ventana ahora es de diez minutos, un mismo supervisor entrega un código nuevo
-- cada diez minutos. Si Central tuviera que corregir dos derivaciones seguidas,
-- la segunda la autoriza otro supervisor (hay cuatro) o espera la ventana
-- siguiente. Antes eran cinco por cada diez minutos.
--
-- La ventana anterior se sigue aceptando: un código que nace y se dicta sobre
-- el final no puede morir en la mitad de la frase. Es decir, un código sirve
-- diez minutos —lo que muestra el reloj del supervisor— y en el peor de los
-- casos se lo acepta un rato más.

create or replace function ventana_pin_actual()
returns bigint
language sql
stable
set search_path = public
as $$ select floor(extract(epoch from now()) / 600)::bigint $$;

comment on function ventana_pin_actual() is
  'La ventana del código de supervisor: 10 minutos (migración 0110; eran 2 en la 0093).';

-- El reloj que ve el supervisor tiene que contar sobre la misma ventana, o
-- estaría dictando un código con un tiempo que no es el que vale.
create or replace function mi_pin_supervisor()
returns table (codigo text, expira_en integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  select p.rol::text into v_rol from perfiles p where p.id = auth.uid();
  if v_rol is null or v_rol not in ('gerencia', 'admin') then
    raise exception 'Solo gerencia puede autorizar correcciones';
  end if;

  return query
    select codigo_pin_supervisor(auth.uid(), ventana_pin_actual()),
           (600 - (floor(extract(epoch from now()))::bigint % 600))::integer;
end $$;
revoke all on function mi_pin_supervisor() from public;
grant execute on function mi_pin_supervisor() to authenticated;
