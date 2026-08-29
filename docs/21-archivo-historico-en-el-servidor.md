# El archivo histórico del servidor, dentro del CRM

**Planteado por gerencia el 29-08-2026.** Textual: «tenemos 3 teras de
información que debería mostrar el sistema como información histórica de los
clientes, pdfs, fotos de instalación, videos… todo se necesita como contexto. Es
muy difícil pagar una nube, pero podemos usar nuestro servidor de la empresa
donde tenemos toda esta información».

Este documento es la respuesta técnica y el plan. **Todavía no se construyó
nada**: falta el piloto y tres datos que solo puede dar la empresa (final del
documento).

---

## 1. Qué hay en el servidor (mirado el 29-08)

Servidor de archivos en la red local: **`\\192.168.10.210`**, con **2 935 GB
usados y 1 535 GB libres**. Desde la máquina de Darwin está montado en cinco
unidades:

| Unidad | Recurso |
|---|---|
| `V:` | `Ventas\ESPECIFICACIONES TÉCNICAS DE EQUIPOS\FICHA TECNICA 2021-2026` |
| `W:` | `09. fotos\CLIENTES` |
| `X:`, `Z:` | `Mantenimiento\POST VENTA 2026\INFORMES DE SERVICIO TECNICOS 2023` |
| `Y:` | `Marketing` |

**La noticia buena: las fotos ya están ordenadas por cliente.** `W:\FOTOS`
tiene tres carpetas —`PRIVADO` (1 338 clientes), `PUBLICO` (110) y `SISTEMA DE
ANCLAJE`—, y cada cliente es una carpeta con su razón social («ABENGOA PERU SA»,
«GOBIERNO REGIONAL DE UCAYALI», «ACOSTA ORUNA ROSA ALBINA - HOTEL ACOSTA»).
Adentro, subcarpetas por hecho: «ENTREGA DE REPUESTO 25.11.2021», «foto de
repuesto cotizado». Los archivos son en su mayoría fotos de WhatsApp de 80 a
130 KB.

Eso significa que **el emparejamiento contra las 14 137 cuentas del CRM se puede
hacer por nombre de carpeta**, con el mismo criterio con el que ya se casaron los
`.doc` de postventa de `R:\` y las 2 644 cotizaciones históricas de `S:` y `T:`.

---

## 2. La decisión de fondo: no hace falta pagar la nube

El CRM **ya sabe servir un archivo privado que no vive en su base**: el PDF de
las cotizaciones históricas está en un bucket privado de R2 y se abre con
`/api/cotizaciones-historicas/[id]/pdf`, que **firma el enlace en el momento del
clic** (vence en 5 minutos) y deja la autorización en manos de RLS. Ese patrón
—enlace estable en la pantalla, firma efímera al hacer clic— es exactamente el
que sirve para el servidor de la empresa. Lo único que cambia es a dónde apunta
la firma.

Como comparación, subir los 3 TB enteros a R2 costaría **~US$ 45 al mes**
(~S/ 170) sin costo de salida. No se recomienda todavía, pero conviene tener el
número: si el servidor da problemas, migrar es una decisión de plata, no de
arquitectura.

---

## 3. La solución, en tres piezas

### Pieza 1 — El índice, dentro del CRM  *(la que decide si esto sirve)*

Un script recorre el servidor **una vez** y escribe una tabla
`archivos_servidor`: ruta, `cuenta_id`, serie del equipo si aparece en el
nombre, tipo (foto / video / pdf / documento), tamaño, fecha y hash. Después
corre cada noche y solo levanta lo nuevo.

Es texto: aunque haya 400 000 archivos son unos cientos de MB en Postgres. RLS
con el mismo criterio que el resto del CRM —gerencia y postventa ven todo, el
comercial lo de las cuentas de SU cartera— salvo que gerencia decida otra cosa
(ver las preguntas abiertas).

**Sin esta pieza no hay «vista de nube»: hay un explorador de archivos.** 3 TB
en carpetas no son contexto; son un depósito. Lo que convierte el depósito en
contexto es que la ficha del cliente diga «17 fotos, 3 informes, 1 video» y se
abran desde ahí.

### Pieza 2 — El acceso desde fuera: túnel de Cloudflare + un agente chico

El servidor está en `192.168.10.210`, una IP privada: Vercel no la alcanza, y
los comerciales trabajan desde la calle.

- **`cloudflared`** en el servidor. Es gratis, no necesita IP pública ni abrir
  un solo puerto en el router: el túnel sale de adentro hacia afuera por 443.
- **Un agente Node de ~100 líneas** en el servidor, que solo entrega rutas que
  estén en el índice y solo contra un **token firmado (HMAC) que emite el CRM al
  hacer clic**, con vencimiento de minutos. Montaje de la carpeta en **solo
  lectura**.
- El navegador del comercial baja el archivo **directo del servidor**, sin pasar
  por Vercel (no se paga tránsito ni se ocupa la función).

⚠️ **Nunca compartir SMB a internet ni abrir el puerto 445.** Eso sería regalar
el servidor entero, y ningún ahorro lo justifica.

### Pieza 3 — Las miniaturas en R2  *(lo que lo hace parecer nube)*

Del índice se genera una miniatura de cada foto y un fotograma de cada video, y
**eso** se sube a R2, que ya está montado y pagado. Unas 300 000 miniaturas son
~40 GB: **US$ 0,60 al mes**.

La galería del cliente carga instantánea desde Cloudflare y el enlace de subida
de la oficina solo se usa cuando alguien abre un original. Sin esto, cinco
comerciales mirando fotos saturan el internet de la oficina y la pantalla se
siente rota.

---

## 4. Los riesgos, dichos claro

1. **El servidor pasa a ser parte del CRM.** Si está apagado o se cae el
   internet de la oficina, el histórico desaparece de la pantalla (el CRM sigue
   funcionando). Las miniaturas en R2 amortiguan el golpe: la galería se ve
   igual, solo que el original no abre.
2. **La subida de la oficina es el cuello de botella.** Con 10 Mbps, un video de
   200 MB tarda ~3 minutos. Hay que medirla antes de prometer nada.
3. **3 TB en un solo servidor sin copia es hoy el riesgo más grande de la
   empresa**, y conectarlo al CRM no lo mejora: lo hace más visible. Merece una
   decisión aparte (disco externo rotativo, o los originales críticos a R2).
4. **Seguridad**: solo lectura, solo rutas indexadas, solo con token firmado y
   efímero. El índice no expone la ruta real en el HTML.

---

## 5. Plan por fases

**Fase 1 · Piloto, una semana.** Indexar `W:\FOTOS\PRIVADO`, casarlo con las
cuentas, montar el túnel y agregar una pestaña **«Archivo»** en la ficha del
cliente con la galería y el visor. Sirve para medir de verdad: cuántos archivos
hay, **cuántos casan solos con una cuenta**, y cuánto tarda abrir una foto desde
la calle.

**Fase 2.** Miniaturas en R2 y buscador por cliente, serie y año.

**Fase 3.** `Mantenimiento` (informes de servicio) y `Ventas` (fichas técnicas),
que además se cruzan con los casos de postventa y con el catálogo.

**Fase 4.** `Marketing` — es el que menos se consulta desde la ficha del
cliente.

---

## 6. Lo que falta preguntar antes de arrancar

1. **¿Cuánta subida tiene el internet de la oficina?** Decide si los videos se
   sirven desde el servidor o hay que llevarlos a R2.
2. **¿El servidor está siempre encendido, y con UPS?** Decide cuánto se puede
   depender de él en horario comercial.
3. **¿Quién puede ver qué?** ¿Un comercial ve las fotos de instalación de
   clientes de otro, o solo las de su cartera? El CRM ya sabe hacer las dos
   cosas; es una decisión de gerencia, no técnica.
