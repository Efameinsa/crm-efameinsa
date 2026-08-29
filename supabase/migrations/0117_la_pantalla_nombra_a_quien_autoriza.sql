-- ============================================================
-- CRM EFAMEINSA · Migración 0117 · La pantalla nombra a quien autoriza
-- ============================================================
-- Darwin, 28-08: «¿por qué no pones en el aviso que el supervisor también es
-- Lesly, de logística? Usé el PIN que ella me dio».
--
-- Tenía razón y era una inconsistencia fea: desde la 0116, `operaciones`
-- también dicta el código —por eso el de Lesly funcionó—, pero el aviso que ve
-- Central seguía listando solo a gerencia. Un control que valida una cosa y
-- anuncia otra deja a quien lo usa adivinando a quién llamar, que es
-- exactamente lo que el aviso vino a evitar el 27-08.
--
-- La causa de fondo es que la lista de la pantalla y la validación eran dos
-- listas distintas escritas en dos lugares distintos. Acá pasa a haber UNA: la
-- función de abajo devuelve quién puede autorizar, con el mismo predicado que
-- usa `redirigir_lead_con_pin` para validar. Si mañana entra otro rol, entra en
-- los dos lados a la vez.

create or replace function supervisores_del_pin()
returns table (id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.rol::text
    from perfiles p
   where p.activo
     and (p.rol::text in ('gerencia', 'admin', 'operaciones') or p.es_operaciones)
   order by
     -- Gerencia primero: es a quien Central llama de entrada. El administrador
     -- va último, que es la salida de emergencia y no el camino de todos los días.
     case p.rol::text when 'gerencia' then 1 when 'operaciones' then 2 else 3 end,
     p.nombre;
$$;

revoke all on function supervisores_del_pin() from public;
grant execute on function supervisores_del_pin() to authenticated;

comment on function supervisores_del_pin() is
  'Quién puede autorizar una corrección de derivación, con el mismo criterio con el que se valida el código. La pantalla de Central lo usa para decir a quién pedírselo (migración 0117).';
