-- 0497 · El puente de mkt manda cada destinatario entero, con cuenta_id vacío cuando mkt
-- no sabe de qué cuenta es. Eso borraba la cuenta que el CRM ya había encontrado por el
-- correo del contacto (o que se asignó a mano). Ahora una actualización sin cuenta deja
-- la que estaba (Santos, 15-10; se notó al probar la 0496).

create or replace function public.correos_recibidos_al_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta record;
  v_correo record;
  v_boton text;
begin
  new.email := lower(new.email);
  new.actualizado_at := now();
  -- 0497: mkt manda la fila entera cada vez; si no sabe la cuenta, se queda la que ya tenía.
  if tg_op = 'UPDATE' and new.cuenta_id is null then
    new.cuenta_id := old.cuenta_id;
  end if;
  if new.cuenta_id is null then
    select c.cuenta_id into new.cuenta_id
      from contactos c where lower(c.email) = new.email and c.cuenta_id is not null
      order by c.created_at limit 1;
  end if;
  if new.clic_at is not null and new.aviso_clic_at is null
     and (tg_op = 'INSERT' or old.clic_at is null) and new.cuenta_id is not null then
    select id, razon_social, comercial_id into v_cuenta from cuentas where id = new.cuenta_id;
    select codigo, asunto into v_correo from correos_campana where id = new.correo_id;
    v_boton := nullif(new.enlaces -> 0 ->> 'texto', '');
    if v_cuenta.comercial_id is not null then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      select p.id, 'correo_campana_clic',
             'Hizo clic en un correo: ' || coalesce(v_cuenta.razon_social, new.email),
             new.email || ' hizo clic' || coalesce(' en «' || v_boton || '»', '') || ' del correo '
               || coalesce(v_correo.codigo || ' ', '') || '«' || coalesce(v_correo.asunto, '') || '». Buen momento para llamarle.',
             '/nuevo/cliente/' || new.cuenta_id || '?tab=correos'
        from perfiles p
       where p.id = v_cuenta.comercial_id and p.activo and not coalesce(p.es_prueba, false);
    end if;
    new.aviso_clic_at := now();
  end if;
  return new;
end $$;
insert into _migraciones_aplicadas (archivo) values ('0497_correos_de_campana_no_pierden_la_cuenta.sql')
on conflict do nothing;
