-- 0427 · El WhatsApp de «su sugerencia ya está lista» también busca en el Directorio (09-10).
--
-- Central (Alondra) dejó dos sugerencias, quedaron «Hecha» y no le llegó nada:
-- la cuenta «Central» no tenía celular en su perfil ni estaba en Tasking → Equipo
-- (la importación la saltó por parecer genérica). Su número sí estaba en el
-- Directorio del CRM (0410). Ahora el número se busca, en orden: Tasking → Equipo
-- (aunque esté inactiva para reuniones), celular del perfil y Directorio por el
-- correo de la cuenta. El armado del mensaje queda en una función aparte para
-- poder reenviar uno que no salió.

create or replace function public.tasking_encolar_sugerencia(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug public.sugerencias;
  v_persona public.tasking_personas;
  v_perfil public.perfiles;
  v_numero text;
  v_nombre text;
  v_respuesta text;
begin
  select * into v_sug from public.sugerencias where id = p_id;
  if v_sug.id is null then
    return false;
  end if;
  select * into v_persona from public.tasking_personas where perfil_id = v_sug.autor_id order by activo desc limit 1;
  select * into v_perfil from public.perfiles where id = v_sug.autor_id;

  v_numero := regexp_replace(coalesce(nullif(v_persona.whatsapp, ''), nullif(v_perfil.celular, ''), (
    select d.telefono from public.directorio d join auth.users u on lower(u.email) = lower(d.correo_efameinsa)
     where u.id = v_sug.autor_id and d.activo and coalesce(d.telefono, '') <> '' order by d.orden limit 1
  ), ''), '\D', '', 'g');
  if length(v_numero) = 9 and left(v_numero, 1) = '9' then
    v_numero := '51' || v_numero;
  end if;
  if length(v_numero) < 11 then
    return false;
  end if;

  v_nombre := split_part(split_part(coalesce(nullif(v_persona.nombre, ''), v_perfil.nombre, ''), ' (', 1), ' ', 1);
  if v_nombre in ('Central', 'Almacén', 'Facturación', 'Postventa') then
    v_nombre := split_part((
      select d.nombre from public.directorio d join auth.users u on lower(u.email) = lower(d.correo_efameinsa)
       where u.id = v_sug.autor_id and d.activo order by d.orden limit 1
    ), ' ', 1);
  end if;
  v_respuesta := left(btrim(coalesce(v_sug.respuesta, '')), 600);

  insert into public.tasking_mensajes (canal, tipo, persona_id, sugerencia_id, destino, cuerpo)
  values (
    'whatsapp',
    'sugerencia',
    v_persona.id,
    v_sug.id,
    v_numero,
    '✅ *Tu sugerencia ya está lista*' || E'\n\n'
      || 'Hola' || case when coalesce(v_nombre, '') <> '' then ' ' || v_nombre else '' end
      || ', gracias por tu sugerencia y por sumar a construir algo nuevo.' || E'\n\n'
      || '💡 *' || left(v_sug.titulo, 160) || '*'
      || case when v_respuesta <> '' then E'\n' || v_respuesta else '' end || E'\n\n'
      || 'Revísala aquí:' || E'\n' || 'https://crm.efameinsa.com/sugerencias?ver=' || v_sug.id || E'\n\n'
      || '¿Quedó como esperabas? Si falta algo, deja una nueva sugerencia con el botón 💡. Quedamos atentos.'
  );
  return true;
end;
$$;

revoke all on function public.tasking_encolar_sugerencia(uuid) from public, anon, authenticated;
grant execute on function public.tasking_encolar_sugerencia(uuid) to service_role;

create or replace function public.tasking_avisar_sugerencia_hecha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'hecha' and old.estado is distinct from 'hecha' then
    perform public.tasking_encolar_sugerencia(new.id);
  end if;
  return new;
end;
$$;
