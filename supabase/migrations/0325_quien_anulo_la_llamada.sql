-- 0325 · QUIÉN ANULÓ LA LLAMADA DERIVADA (reunión 28-09 14:18).
--
-- Rubí, en la reunión: «esa llamada de Elvis sale anulada. En la vista del
-- almacén sale anulada… Yo no la anulé, pero parece anulada». Nadie en la
-- sala pudo decir quién: la apertura guardaba cuándo y por qué se anuló
-- (anulada_at, anulada_motivo), pero no QUIÉN. Todo lo demás de la apertura
-- ya dejaba nombre (la envió, la tomó, el informe, la revisión, cada
-- reprogramación); anular era el único paso anónimo.
--
-- Qué pasó con la de ELVIS CHOQUEHUANCA QUISPE (dbadb690…): se anuló el 25-09
-- a las 17:40 con una orden SQL directa, no desde la pantalla, cuando Rubí
-- pidió por WhatsApp «reprogramarla para el lunes» y reprogramar todavía no
-- existía (llegó con la 0311 esa misma tarde). Por eso no hubo aviso al
-- almacén ni nombre. No es un error de corregir_tipo_apertura ni de
-- reprogramar: ninguna de las dos toca anulada_at.
--
-- Desde acá la función deja el nombre de quien anula, y la pantalla lo dice.
-- Las anuladas de antes quedan sin nombre (no se inventa).

alter table public.aperturas_llamada
  add column if not exists anulada_por uuid references public.perfiles (id) on delete set null;
comment on column public.aperturas_llamada.anulada_por is
  'Quién la anuló (0325; reunión 28-09: «yo no la anulé»). Null en las anuladas antes de la 0325.';

-- La función viva de la base, con solo anulada_por agregado.
CREATE OR REPLACE FUNCTION public.anular_apertura_llamada(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La anula postventa';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Diga por qué se anula'; end if;
  update aperturas_llamada
     set anulada_at = now(), anulada_motivo = btrim(p_motivo), anulada_por = auth.uid()
   where id = p_id and anulada_at is null and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Esa apertura no existe o ya estaba anulada'; end if;
end $function$;
