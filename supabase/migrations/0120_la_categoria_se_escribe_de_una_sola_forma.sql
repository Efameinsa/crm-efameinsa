-- ============================================================
-- CRM EFAMEINSA · Migración 0120 · La categoría se escribe de una sola forma
-- ============================================================
-- «No entiendo por qué está este error… corrígelo, da solución» (28-08), sobre
-- el aviso del catálogo: «Lavadora y lavadora son la misma categoría escrita de
-- dos formas — 45 equipos repartidos entre las dos».
--
-- El aviso era correcto y el problema, chiquito: TRES productos de 121 se
-- cargaron con la inicial en mayúscula. Pero parte el catálogo igual, porque
-- para la base «Lavadora» y «lavadora» son dos categorías distintas: el filtro
-- muestra una y esconde la otra, y quien busca lavadoras no ve dos de ellas.
--
-- Se arregla en dos partes, porque avisar de un error que se puede volver a
-- cometer mañana no es arreglarlo:
--
--   1. Los tres que están mal se pasan a minúscula.
--   2. Un disparador normaliza la categoría al guardar. Ya no depende de que
--      quien carga un equipo se acuerde de escribirla igual que los demás.
--
-- Se elige minúscula porque es como están los 118 restantes; la pantalla las
-- muestra con la inicial en mayúscula, que es cosa de cómo se dibuja, no de
-- cómo se guarda.

update productos
   set categoria = lower(btrim(categoria))
 where categoria is not null
   and categoria <> lower(btrim(categoria));

create or replace function normalizar_categoria_producto()
returns trigger language plpgsql as $fn$
begin
  if new.categoria is not null then
    new.categoria := lower(btrim(new.categoria));
    if new.categoria = '' then new.categoria := null; end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_categoria_normalizada on productos;
create trigger trg_categoria_normalizada before insert or update on productos
  for each row execute function normalizar_categoria_producto();

comment on function normalizar_categoria_producto is
  'La categoría se guarda siempre en minúscula: «Lavadora» y «lavadora» partían el catálogo en dos montones que ningún filtro volvía a juntar (migración 0120).';
