---
name: informe-diario-santos
description: "Informe diario de actividades para gerencia: hay que armarlo cada día 30 minutos antes de la salida, con el horario real de Darwin"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 21cf327c-784e-4cb3-88c2-99431b986b09
  modified: 2026-08-20T21:48:53.333Z
---

**Todos los días hay que crear el informe diario de Darwin (Santos Lenin Vilcachagua Ayala) para gerencia**, sin que él lo pida. Va en `C:\Users\diseno\Downloads\INFORMES SANTOS` con el nombre `INFORME_SANTOS_VILCACHAGUA_AYALA_DD_MM_AA.docx`.

**Why:** lo entrega a diario al ing. Carlos y a la srta. Karen; si no está a tiempo, él tiene que escribirlo a mano justo cuando está cerrando el día.

**How to apply:** correr `node scripts/informe-diario.mjs --actividades <json>` desde [[proyecto-crm-efameinsa]] (el script ya tiene el horario y arma el Word sobre el modelo de siempre; la plantilla descomprimida vive en `C:\Users\diseno\.claude\plantillas\informe-diario`). El contenido hora por hora sale de lo trabajado en las sesiones de Claude y de los audios que él manda; **los commits del día con `git log --date=format:%H:%M` dan la hora exacta de cada avance** y son la mejor fuente.

**Horario real (define cuántas filas lleva la tabla y a qué hora se arma):**

| Día | Jornada | Informe a las |
|---|---|---|
| Lunes | 08:00 → **19:00** (recupera la hora del jueves) | 18:30 |
| Martes, miércoles, viernes | 08:00 → 18:00 | 17:30 |
| **Jueves** | 08:00 → **17:00** (sale una hora antes) | 16:30 |
| Sábado | 09:00 → 12:00 (sin almuerzo) | 11:30 |

Almuerzo de **13:00 a 14:00** de lunes a viernes, y va como fila propia.

⚠️ **La última fila llega hasta la HORA DE SALIDA, no hasta la hora en que se escribe el informe.** Si se arma a las 16:30 de un jueves, la última fila dice 16:00-17:00. Él lo pidió explícitamente.

El informe cierra con **Observaciones**: estado del CRM y lo que sigue pendiente de gerencia (hoy: catálogo con precios, subdominio crm.efameinsa.com y margen bruto real).
