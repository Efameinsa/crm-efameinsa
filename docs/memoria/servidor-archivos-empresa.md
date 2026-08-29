---
name: servidor-archivos-empresa
description: "El archivo histórico de la empresa: \\\\192.168.10.210, 2.9 TB, fotos ordenadas POR CLIENTE; plan para verlo desde el CRM en docs/21"
metadata: 
  node_type: memory
  type: reference
  originSessionId: f45e7f8f-fea2-4caf-a65f-21983e184bfe
  modified: 2026-08-29T17:18:03.843Z
---

Servidor de archivos de la oficina: **`\\192.168.10.210`**, **2 935 GB usados,
1 535 GB libres**. Es la «nube» que gerencia quiere ver dentro del CRM
(planteado el 29-08-2026: «tenemos 3 teras… pdfs, fotos de instalación, videos,
todo se necesita como contexto; es muy difícil pagar una nube»).

Unidades montadas en la máquina de Darwin:

| Unidad | Recurso |
|---|---|
| `V:` | `Ventas\ESPECIFICACIONES TÉCNICAS DE EQUIPOS\FICHA TECNICA 2021-2026` |
| `W:` | `09. fotos\CLIENTES` |
| `X:`, `Z:` | `Mantenimiento\POST VENTA 2026\INFORMES DE SERVICIO TECNICOS 2023` |
| `Y:` | `Marketing` |

**El dato que hace viable el proyecto: las fotos ya están ordenadas por
cliente.** `W:\FOTOS` → `PRIVADO` (1 338 carpetas con la razón social),
`PUBLICO` (110) y `SISTEMA DE ANCLAJE`; dentro, subcarpetas por hecho («ENTREGA
DE REPUESTO 25.11.2021»). Casi todo son fotos de WhatsApp de 80–130 KB. Se puede
casar contra las 14 137 cuentas por nombre, igual que se hizo con los `.doc` de
`R:\` y las cotizaciones de `S:`/`T:`.

**El plan completo está en `docs/21-archivo-historico-en-el-servidor.md`** (vive
en el repo, que es lo que viaja): índice en el CRM + túnel de Cloudflare gratis
con un agente de solo lectura y enlaces firmados + miniaturas en R2 (~US$ 1/mes).
Nada construido todavía. Faltan tres respuestas de la empresa: subida del
internet de la oficina, si el servidor está siempre encendido, y si un comercial
puede ver fotos de clientes de otro.

⚠️ **3 TB en un solo servidor sin copia** es hoy el riesgo más grande de la
empresa; conectarlo al CRM no lo mejora.

Relacionado: [[proyecto-crm-efameinsa]], [[entorno-windows-darwin]].
