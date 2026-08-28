-- ============================================================
-- CRM EFAMEINSA · Migración 0101 · La cuenta de soporte
-- ============================================================
-- Carlos, 28-08: «hay que darle un usuario y contraseña a Lesly, que le permita
-- ver como gestor, o sea, como postventa también, pero nada de gerencia… ella
-- tiene que conocer todas estas funcionalidades para que sepa y para que te
-- sirva también de soporte».
--
-- Es un tercer oficio y no encajaba en ninguno de los que hay: no vende —no
-- tiene cartera ni se le mide el día— pero necesita ver las dos barras, la del
-- comercial y la del área, porque su trabajo es que los demás sepan usarlas.
--
-- Sin esta marca habría que darle rol de comercial, y entonces aparecería en el
-- cierre del día de gerencia como alguien que «todavía no generó su reporte»,
-- todos los días, para siempre. Medir a quien no vende es ruido, y el ruido en
-- un tablero de control se termina ignorando entero.

alter table perfiles add column if not exists es_soporte boolean not null default false;

comment on column perfiles.es_soporte is
  'Acompaña a los usuarios: ve las pantallas del comercial y las del área de postventa, pero no vende y no se le mide como comercial —no entra en el cierre del día ni en los tableros de gerencia— (migración 0101).';

-- Ve las dos barras. El ALCANCE de lo que hay dentro no cambia: sigue siendo el
-- de un comercial —su cartera— porque «nada de gerencia» fue explícito.
create or replace function es_soporte()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select es_soporte from perfiles where id = auth.uid()), false)
$$;

revoke all on function es_soporte() from public;
grant execute on function es_soporte() to authenticated;
