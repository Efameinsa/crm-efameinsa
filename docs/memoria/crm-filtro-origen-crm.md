---
name: crm-filtro-origen-crm
description: El filtro origen='crm' vacía pantallas del comercial — las ventas y oportunidades importadas del Excel son historico_excel
metadata:
  type: feedback
---

En el CRM de Efameinsa, filtrar `origen = 'crm'` en una consulta que el comercial
mira deja la pantalla en blanco: casi todo su trabajo real entró por el import de
su Excel y quedó como `historico_excel`. Ya pasó tres veces — Kanban y «Mi día»
(plan 11, 24-08), y la agenda del mes y el cierre semanal (28-08, la venta de
US$ 21.000 de Katerine que «no se veía»).

**Por qué:** el filtro se puso para no inundar pantallas con el histórico viejo,
pero el import no trae solo lo viejo: trae también lo que el comercial cerró esta
semana. Y los reportes de gerencia (`src/lib/reportes.ts`) NO filtran por origen,
así que la misma tabla daba dos números distintos según quién mirara.

**Cómo aplicarlo:** si la consulta ya está acotada por fecha (mes, semana, día),
el filtro por origen sobra — sacarlo. Solo se justifica donde no hay ventana de
fechas y el histórico realmente desbordaría, como «corresponde cerrar» y «ventas
sin informe de cierre» en `/comercial`. Antes de dar por buena una pantalla de
números, compararla con lo que ve gerencia. Ver [[proyecto-crm-efameinsa]].
