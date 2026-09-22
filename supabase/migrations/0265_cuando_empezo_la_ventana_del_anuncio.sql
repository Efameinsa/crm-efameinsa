-- La ventana de 72 h de Meta se cuenta desde el CLIC EN EL ANUNCIO, no desde
-- el último mensaje del cliente.
--
-- Meta abre una «conversación de punto de entrada gratuito» cuando alguien
-- toca un anuncio de clic-a-WhatsApp: dura 72 horas desde ese momento y dentro
-- de ella la empresa escribe libre y gratis. Aparte corre la ventana de
-- atención al cliente de 24 horas, que se renueva con cada mensaje del
-- cliente. Se puede escribir mientras una de las dos esté abierta.
--
-- El CRM guardaba el `ctwa_clid` pero no CUÁNDO llegó, así que contaba las 72
-- horas desde el último mensaje: daba por abierta una ventana que Meta ya
-- había cerrado. Acá queda el momento exacto, y se actualiza si el mismo
-- cliente vuelve a entrar por otro anuncio (eso abre una ventana nueva).

alter table wa_conversaciones
  add column if not exists anuncio_at timestamptz;

comment on column wa_conversaciones.anuncio_at is
  'Cuándo entró el clic del anuncio (referral de Meta). Las 72 h de la ventana gratuita se cuentan desde acá (0265).';

-- Las conversaciones que ya existen: la primera vez que se vio el anuncio es
-- cuando nació la conversación.
update wa_conversaciones
   set anuncio_at = created_at
 where anuncio_at is null
   and (ctwa_clid is not null or referral is not null);
