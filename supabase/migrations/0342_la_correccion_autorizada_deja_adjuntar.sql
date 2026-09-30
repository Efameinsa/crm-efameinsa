-- Mientras la corrección de un cierre está autorizada, el expediente se puede
-- completar sin pedir OTRO código (Santos, 30-09-2026).
--
-- POR QUÉ: Gabriela (PV2) pidió a Lesly el código para corregir el 046 y
-- adjuntar el voucher. El código abrió la corrección (0154), pero la pantalla
-- de corrección escondía el expediente, y fuera de ella agregar un documento a
-- un cierre emitido pide un código propio (0142). Con un solo código de Lesly
-- no había forma de adjuntar nada.
--
-- AHORA: si quien agrega tiene una ventana de corrección VIVA sobre ese mismo
-- cierre (sin vencer y sin guardar), el código no hace falta: el documento
-- queda firmado con quien autorizó esa ventana. Sin ventana, todo sigue igual
-- que en la 0142: código de operaciones o gerencia.
--
-- Se parcha la definición viva, no se copia (regla del repositorio).

do $$
declare
  v text;
  viejo constant text := $x$v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');$x$;
  nuevo constant text := $x$-- 0342: la corrección autorizada del mismo cierre ya trae la firma.
  select ci.autorizo into v_autorizo
    from correcciones_informe ci
   where ci.informe_id = p_informe
     and ci.solicitante_id = v_quien
     and ci.guardada_at is null
     and ci.expira_at > now()
   order by ci.expira_at desc
   limit 1;
  if v_autorizo is null then
    v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');
  end if;$x$;
begin
  select pg_get_functiondef('public.agregar_adjuntos_cierre_sellado(uuid,jsonb,text)'::regprocedure) into v;
  if position('0342:' in v) = 0 then
    if position(viejo in v) = 0 then
      raise exception 'agregar_adjuntos_cierre_sellado: no se encontró dónde valida el código';
    end if;
    execute replace(v, viejo, nuevo);
  end if;
end $$;
