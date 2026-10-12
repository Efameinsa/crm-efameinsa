-- NOTA EDITABLE DEL DESTINO FINAL (Rubí, 12-10): «agregar un item de NOTA en
-- destino final para poder modificar y poner alguna observación». La nota en
-- amarillo de la fila DESTINO FINAL de la apertura era fija («EQUIPO DEBERÁ
-- LLEGAR A DOMICILIO», solo por agencia con dirección final).
--   null = la automática de siempre · '' = sin nota · texto = esa nota.
alter table public.servicios_postventa
  add column if not exists destino_nota text;

comment on column public.servicios_postventa.destino_nota is
  'NOTA resaltada de la fila DESTINO FINAL de la apertura: null = automática (EQUIPO DEBERÁ LLEGAR A DOMICILIO por agencia), vacío = sin nota, texto = esa nota (0438).';
