-- 0424 — Los códigos equivocados por fin quedan anotados.
--
-- Desde la 0093, validar_codigo_autorizacion (y pedir_expediente,
-- pedir_cartera, unir_lead_a_cuenta, corregir_canal_lead) hacen
--   insert into intentos_pin_supervisor …; raise exception '…';
-- y el RAISE deshace el INSERT junto con todo lo demás: la tabla nunca tuvo
-- una sola fila (visto el 09-10, cuando Brenda decía que su código «no
-- funciona» y no había ningún intento que mirar). Consecuencia doble: el tope
-- de 5 intentos cada 10 minutos nunca frenó a nadie, y no queda rastro de
-- quién prueba códigos.
--
-- Postgres no tiene transacciones autónomas, así que el intento se anota
-- DESPUÉS, en otra llamada: el servidor del CRM (src/lib/supabase/intento-pin.ts)
-- ve volver uno de esos rechazos y llama a esta función con la misma sesión.
-- Solo anota a quien llama: a lo sumo, uno se bloquea a sí mismo.

create or replace function public.anotar_intento_pin_fallido()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into intentos_pin_supervisor (solicitante_id) values (auth.uid());
end $$;

revoke all on function public.anotar_intento_pin_fallido() from public, anon;
grant execute on function public.anotar_intento_pin_fallido() to authenticated;
