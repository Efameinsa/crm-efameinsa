-- 0409 · «YA SE SOLUCIONÓ LO QUE REPORTÓ» (Santos, 06-10-2026).
--
-- Cuando el administrador marca una sugerencia como «Hecha», quien la dejó
-- recibía solo un aviso en la campana («Su sugerencia: hecha»), que se pierde
-- entre los demás. Ahora, al entrar al CRM, le aparece un aviso propio con lo
-- que reportó y la respuesta, hasta que lo da por visto.
--
-- `solucion_vista_at`: cuándo el autor vio ese aviso. Lo marca solo el autor,
-- por la función (la RLS de update es solo del admin, 0399).

alter table public.sugerencias add column if not exists solucion_vista_at timestamptz;

-- Si el admin la vuelve a abrir (revisando, nueva…) y luego la cierra otra
-- vez, el aviso tiene que volver a salir.
create or replace function public.sugerencia_reinicia_aviso()
returns trigger
language plpgsql
as $$
begin
  if new.estado is distinct from old.estado and new.estado = 'hecha' then
    new.solucion_vista_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sugerencia_reinicia_aviso on public.sugerencias;
create trigger sugerencia_reinicia_aviso
  before update of estado on public.sugerencias
  for each row execute function public.sugerencia_reinicia_aviso();

create or replace function public.marcar_solucion_vista(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sugerencias
     set solucion_vista_at = now()
   where id = p_id
     and autor_id = auth.uid()
     and estado = 'hecha';
$$;

revoke all on function public.marcar_solucion_vista(uuid) from public, anon;
grant execute on function public.marcar_solucion_vista(uuid) to authenticated;
