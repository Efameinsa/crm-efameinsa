---
name: crm-accesos-y-ubicacion
description: El CRM geolocaliza los ingresos para saber dónde están las laptops de la empresa; el seguimiento está en el contrato de los empleados
metadata: 
  node_type: memory
  type: project
  originSessionId: 14334818-76e3-47a1-a6b6-8d93f2ef1bfe
  modified: 2026-08-28T16:07:43.772Z
---

**Gerencia → «Accesos y equipos»** (`/gerencia/accesos`, 28-08-2026): quién entró, desde qué equipo, hace cuánto, y **un mapa con dónde está cada laptop**. Las computadoras son de la empresa y los empleados se las llevan; **Darwin confirmó que el seguimiento está en el contrato de los empleados**, así que la geolocalización está autorizada — no hace falta volver a plantearlo.

**Cómo funciona:** la tabla `accesos` (que existe desde el día uno por la regla 4) más `ubicaciones_ip` (migración 0103), que cachea la ubicación **una vez por IP**. El proveedor es **ip-api.com** y se eligió midiendo con las IP reales: devuelve el distrito («Vitarte, Lima region» = la oficina), mientras que ipwho.is devolvía el centro de Lima para todas y apilaba cuatro conexiones en el mismo punto. ipwho.is quedó de respaldo. Las IP privadas no se consultan.

**Precisión, para no prometer de más:** una IP ubica a la central del proveedor, no a la persona. Distingue Lima de Arequipa o del extranjero; no dice en qué calle está nadie. Por eso el mapa dibuja círculos y no alfileres, y la pantalla lo aclara.

**La IP de la oficina se reconoce sola**: es la que comparten tres o más personas (hoy 181.66.9.86, Telefónica, Vitarte). Todo lo demás se marca «fuera de la oficina».

**Pendiente que Carlos pidió y NO está hecho:** bloquear el ingreso desde equipos no autorizados (con vista de admin para dar/quitar acceso) e impedir descargar la cartera. Esta pantalla mira, no bloquea.

Relacionado: [[proyecto-crm-efameinsa]], [[crm-cuenta-soporte-y-reporte-diario]].
