-- EL HORARIO DE ATENCIÓN DE LA AGENCIA EN LA APERTURA (Lesly, 15-10: «en las
-- aperturas deben poner los horarios de atención de las agencias; eso lo debe
-- levantar postventa previamente en coordinaciones»).
--
-- Va junto a la agencia y su dirección (0259, 0345): postventa lo anota al
-- verificar «Dirección y quién recibe» (o en la apertura desde un caso de
-- garantía), sale en la fila «Primer destino» de la apertura y el almacén lo
-- ve en su pedido para no llegar con la agencia cerrada. Obligatorio cuando
-- la entrega es por agencia; los pedidos ya verificados lo piden recién al
-- emitir la apertura.

alter table public.servicios_postventa add column if not exists agencia_horario text;

comment on column public.servicios_postventa.agencia_horario is
  'Horario de atención de la agencia donde el almacén deja el equipo (Lesly 15-10). Lo levanta postventa en la coordinación.';
