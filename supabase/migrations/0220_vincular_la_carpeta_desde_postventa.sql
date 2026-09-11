-- ============================================================
-- Vincular la carpeta del servidor también desde postventa
-- ============================================================
-- Ariana, 11-09, en la ficha de SÁNCHEZ DIESTRA DAVID: le da a «Vincular» la
-- carpeta de fotos del servidor «y no pasa nada». No era el servidor Linux ni
-- el túnel de Cloudflare (los dos contestan): la ficha es de la cartera de C5
-- y el vínculo se guarda en `cuentas.carpetas_servidor`, que por RLS solo
-- escribe el dueño de la cartera. El UPDATE afectaba cero filas, Supabase no
-- da error por eso, y el botón —un <form action> sin respuesta— se quedaba
-- mudo. Dos fallas: la silenciosa de siempre (misma lección que cambiarEtapa,
-- reprogramarAccion, registrarActividad) y un botón que no dice nada.
--
-- Y el permiso: los informes y las fotos del servidor son la «riqueza de
-- postventa» (plan 24). Quien atiende al cliente desde el área tiene que
-- poder vincularlos, sea de quien sea la cartera. Es metadato de la ficha, no
-- cartera: no mueve nada y cualquiera lo puede cambiar. La función decide el
-- permiso y valida la carpeta, en vez de dejar que RLS filtre en silencio.

create or replace function vincular_carpeta_servidor(p_cuenta uuid, p_clase text, p_ruta text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual jsonb;
  v_clase_ruta text;
begin
  if p_clase not in ('informes', 'fotos') then
    raise exception 'Clase de carpeta desconocida';
  end if;

  if not exists (
    select 1 from cuentas c
     where c.id = p_cuenta
       and (
         c.comercial_id = auth.uid()
         or es_backoffice()
         or (puede_postventa() and not es_cuenta_prueba())
       )
  ) then
    raise exception 'Solo el comercial de la cartera, postventa o gerencia pueden vincular la carpeta de este cliente';
  end if;

  if p_ruta is not null then
    select clase into v_clase_ruta from carpetas_servidor where ruta = p_ruta;
    if v_clase_ruta is null then
      raise exception 'Esa carpeta no está en el índice del servidor. Si es nueva, hay que refrescar el índice.';
    end if;
    if v_clase_ruta <> p_clase then
      raise exception 'Esa carpeta es de otra clase de documentos.';
    end if;
  end if;

  select coalesce(carpetas_servidor, '{}'::jsonb) into v_actual from cuentas where id = p_cuenta;
  if p_ruta is null then
    v_actual := v_actual - p_clase;
  else
    v_actual := v_actual || jsonb_build_object(p_clase, p_ruta);
  end if;

  update cuentas
     set carpetas_servidor = case when v_actual = '{}'::jsonb then null else v_actual end,
         updated_at = now()
   where id = p_cuenta;

  return case when p_ruta is null then 'Vínculo quitado' else 'Carpeta vinculada' end;
end $$;

comment on function vincular_carpeta_servidor is
  'Vincula (o quita) la carpeta de informes o fotos del servidor a la ficha de un cliente. Lo puede hacer el dueño de la cartera, postventa o gerencia: es metadato de la ficha, no cartera (11-09).';

revoke all on function vincular_carpeta_servidor(uuid, text, text) from public;
grant execute on function vincular_carpeta_servidor(uuid, text, text) to authenticated;
