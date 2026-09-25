-- 0309 · La campana deja el canal en tiempo real (25-09).
--
-- El canal vivo de notificaciones hacía que la base decodificara cada aviso y
-- lo revisara contra la seguridad de cada pestaña suscrita: era lo que más
-- recursos gastaba del CRM. La campana ya repasaba la tabla y anunciaba lo
-- nuevo (ventana emergente y sonido); ahora lo hace cada 20 s con la pestaña a
-- la vista y es su único camino. Se saca la tabla de la publicación.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones') then
    alter publication supabase_realtime drop table public.notificaciones;
  end if;
end $$;
