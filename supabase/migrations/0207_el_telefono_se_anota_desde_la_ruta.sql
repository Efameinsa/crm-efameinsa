-- ============================================================
-- El teléfono se anota desde la lista, sin entrar a la ficha
-- ============================================================
-- Ariana, 10-09: «¿cómo voy a gestionar si no visualizo sus teléfonos? y así
-- son varios». Son 47 de los 327 clientes de la ruta: la fila no muestra el
-- número porque el cliente no tiene NINGÚN contacto con teléfono cargado —el
-- parque instalado se armó desde los Excel y las guías de remisión, que traen
-- la máquina pero no a quién llamar—.
--
-- Conseguir el número es trabajo suyo (lo pregunta, lo busca en la guía, se lo
-- pasa el técnico). Lo que no puede pasar es que, ya con el número en la mano,
-- tenga que abrir la ficha del cliente para guardarlo… porque en 47 casos de
-- estos el cliente ES DE OTRO COMERCIAL y la ficha se la abre en modo lectura:
-- `contactos_postventa_select` la deja MIRAR contactos ajenos, no escribirlos
-- (0095/0109). Hoy el número se le queda en un papel.
--
-- Esta función es el permiso justo: agregar un teléfono donde no había,
-- sin tocar la cartera —la regla de la 0080 sigue intacta: lo que es de
-- postventa es el expediente, no el cliente— y sin poder pisar un número que
-- alguien ya cargó. Si el cliente ya tiene teléfono, no lo cambia: lo dice.
--
-- QUIÉN PUEDE: el dueño de la cuenta, backoffice, y postventa sobre los
-- clientes en los que tiene un caso (la misma pregunta que ya decide si puede
-- verlos). Central no: su trabajo es derivar, y para eso ya tiene el lead.

create or replace function anotar_telefono_de_ruta(
  p_cuenta   uuid,
  p_telefono text,
  p_nombre   text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digitos  text;
  v_nombre   text;
  v_existe   contactos%rowtype;
  v_hay_prin boolean;
begin
  if p_cuenta is null then
    raise exception 'Falta el cliente';
  end if;

  -- El número, limpio. Se guarda tal como lo escribió ella (los apuntes traen
  -- anexos y «/» entre dos números y eso es información), pero se valida por
  -- los dígitos: «no tiene» o «ver con el técnico» no es un teléfono.
  v_digitos := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  if length(v_digitos) < 6 then
    raise exception 'Ese número está incompleto: escriba al menos 6 dígitos (celular 9, fijo con su código)';
  end if;
  if length(v_digitos) > 20 then
    raise exception 'Ese número tiene demasiados dígitos';
  end if;

  if not exists (
    select 1 from cuentas c
     where c.id = p_cuenta
       and (
         c.comercial_id = auth.uid()
         or es_backoffice()
         or (puede_postventa() and postventa_tiene_caso(p_cuenta))
         or (es_postventa() and not es_cuenta_prueba())
       )
  ) then
    raise exception 'No puede anotar el teléfono de este cliente';
  end if;

  -- Si ya hay un número cargado, esto no lo pisa. Corregir un teléfono
  -- existente es otra cosa —se hace en la ficha, donde queda a la vista de
  -- quién es el cliente— y no debe poder hacerse de pasada desde una lista.
  select * into v_existe
    from contactos
   where cuenta_id = p_cuenta
     and telefono_normalizado is not null
     and telefono_normalizado <> ''
   order by es_principal desc, created_at
   limit 1;

  if found then
    if v_existe.telefono_normalizado = normalizar_telefono(p_telefono) then
      return 'Ese número ya estaba cargado';
    end if;
    return 'Este cliente ya tiene teléfono (' || v_existe.telefono || '). Para cambiarlo, entre a su ficha.';
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');

  -- Lo normal acá es que exista un contacto SIN teléfono —el nombre vino del
  -- Excel y el número nunca—: se le completa a ese, que es el que la pantalla
  -- ya muestra, en vez de dejar dos fichas de la misma persona.
  select * into v_existe
    from contactos
   where cuenta_id = p_cuenta
     and (telefono is null or btrim(telefono) = '')
   order by es_principal desc, created_at
   limit 1;

  if found then
    update contactos
       set telefono = btrim(p_telefono),
           nombre = coalesce(v_nombre, nombre)
     where id = v_existe.id;
    return 'Teléfono anotado';
  end if;

  select exists (select 1 from contactos where cuenta_id = p_cuenta and es_principal)
    into v_hay_prin;

  insert into contactos (cuenta_id, nombre, telefono, es_principal)
  values (p_cuenta, coalesce(v_nombre, 'Contacto'), btrim(p_telefono), not v_hay_prin);

  return 'Teléfono anotado';
end $$;

comment on function anotar_telefono_de_ruta is
  'Agrega el teléfono de un cliente que no tenía ninguno, desde la ruta de mantenimiento y sin abrir su ficha (10-09, pedido de postventa). No pisa un número ya cargado y no mueve la cartera.';

revoke all on function anotar_telefono_de_ruta(uuid, text, text) from public;
grant execute on function anotar_telefono_de_ruta(uuid, text, text) to authenticated;
