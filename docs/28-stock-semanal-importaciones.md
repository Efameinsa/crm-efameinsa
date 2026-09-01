# El stock semanal de Importaciones

**Decidido por el ing. Carlos el 01-09-2026.** Textual: «ese Excel brindarle
para que lo pueda subir semanalmente… ya codificado todo, lo pones en la ruta y
nada más… dale las columnas que necesitas».

Hasta hoy el stock que ve el comercial en el cotizador es una foto: la columna
STOCK del maestro de Lesly el día que se cargó el catálogo (rotulada «(ref.)»,
ver docs/22 §B2). Desde ahora esa cifra la manda **Importaciones, una vez por
semana, con un Excel**. El almacén por número de serie (`inventario_equipos`,
migración 0117) sigue siendo otra cosa y sigue vacío: cuando se cargue se
muestra aparte como «en almacén».

Esto ya está construido: `scripts/cargar-stock-semanal.mjs`. Lo que falta es
que Importaciones entregue el primer Excel con el formato de abajo.

---

## 1. Qué columnas tiene que traer el Excel (pedido a Importaciones)

Una hoja con una tabla, una fila por equipo. Las cabeceras pueden ir en
cualquier fila (arriba puede haber un título o la fecha de la semana) y en
cualquier orden; el script las encuentra por su nombre:

| Columna | Obligatoria | Nombres que se aceptan | Qué va |
|---|---|---|---|
| **CÓDIGO** | sí | `CODIGO`, `CÓDIGO`, `COD.`, `CODIGO EQUIPO`, `SKU` | El código del maestro de Lesly, tal cual está en el CRM (`CALE25`, `LAVW105`, `SECU30`). Mayúsculas/minúsculas y espacios no importan. |
| **STOCK** | sí | `STOCK`, `CANTIDAD`, `CANT.`, `UNIDADES`, `UND`, `EXISTENCIAS`, `DISPONIBLES` | Número entero ≥ 0. **Cero significa «no queda ninguna»**; una celda **en blanco significa «no dijeron»** y esa fila no se carga (se avisa). |
| ALMACÉN | no | `ALMACEN`, `ALMACÉN`, `UBICACION`, `UBICACIÓN`, `LOCAL`, `SEDE` | Dónde está (PLANTA / EXHIBICIÓN / TIENDA). Si un código viene en varias filas, una por almacén, **el stock es la suma**. Solo se usa para eso y para el reporte: no se escribe en la ficha. |
| DESCRIPCIÓN | no | `DESCRIPCION`, `DESCRIPCIÓN`, `EQUIPO`, `DETALLE`, `NOMBRE`, `PRODUCTO` | Para que el reporte se entienda cuando un código no existe, y para distinguir un código repetido por su modelo. |

Cualquier otra columna (marca, precio, proveedor, observaciones) se ignora. El
script **nunca toca precio, nombre ni ficha**: solo el stock (regla «el
catálogo es sagrado», docs/19 §3).

Ejemplo mínimo:

| CÓDIGO | DESCRIPCIÓN | STOCK | ALMACÉN |
|---|---|---|---|
| CALE25 | RODILLO PLANCHADOR ELECTRICO GMP | 5 | PLANTA |
| LAVW105 | LAVADORA UNIMAC UWT105 | 0 | PLANTA |
| SECU30 | SECADORA UNIMAC UT030 | 2 | PLANTA |
| SECU30 | SECADORA UNIMAC UT030 | 1 | EXHIBICIÓN |

(SECU30 queda en 3.)

**Los códigos que nombran dos máquinas.** En el maestro `LAV180` y `LAV280`
nombran a la vez la lavadora rígida (RX) y la flotante (FX). Hoy en el CRM
`LAV180` = RX180, `LAV280` = RX280 y la FX280 tiene código propio `LAVF280`
(memoria `crm-codigo-repetido-fx-vs-rx`). Importaciones tiene que contar cada
una con SU código; si escribe `LAV180` a secas, se carga a la RX180 y el
reporte lo avisa con un «OJO» para que alguien confirme.

---

## 2. Dónde dejarlo

**`V:\SANTOS\STOCK SEMANAL\`** — la carpeta de trabajo de Santos en el
servidor de la empresa (`\\192.168.10.210`, unidad `V:`, la misma donde viven
`V:\SANTOS\<MARCA>\<CODIGO>\` y los reportes para Lesly; ver docs/21 §1).

Nombre sugerido del archivo: **`2026-09-07 stock importaciones.xlsx`** (la
fecha primero, para que ordenen solos). No hace falta borrar los anteriores:
el script toma **el `.xlsx` más nuevo de la carpeta**, así que queda el
histórico semana a semana.

Si Importaciones no tiene la unidad `V:` mapeada, que lo mande por correo o
WhatsApp y Santos lo deja ahí; el script funciona igual con cualquier ruta.

---

## 3. Cómo se corre

Desde la carpeta del CRM, primero **el plan** (no modifica nada, solo lee):

```
node --env-file=.env.local scripts/cargar-stock-semanal.mjs
```

Sin argumentos usa `V:\SANTOS\STOCK SEMANAL\` y el archivo más nuevo. También
se le puede dar un archivo o una carpeta concreta, y forzar la hoja:

```
node --env-file=.env.local scripts/cargar-stock-semanal.mjs "V:\SANTOS\STOCK SEMANAL\2026-09-07 stock importaciones.xlsx"
node --env-file=.env.local scripts/cargar-stock-semanal.mjs "C:\Descargas\stock.xlsx" --hoja="EQUIPOS"
```

El plan dice, por bloques:

- **Cambian**: código → stock actual → stock nuevo.
- **Sin cambio**.
- **En el Excel pero NO en el catálogo** (ver §4).
- **OJO: códigos que nombran dos máquinas** (ver §1).
- **Repetidos en el Excel con cantidades distintas** y sin almacén: no se sabe
  cuál vale, no se tocan.
- **Inactivos**: existen en el CRM pero están dados de baja; no se tocan.
- **Filas que no se pudieron leer**: sin código, cantidad ilegible («varios»,
  «2-3»), cantidad en blanco.
- **Activos en el CRM que NO vienen en el Excel**: **conservan su cifra
  anterior, no se ponen en cero.** Hay que preguntarle a Importaciones si se
  olvidaron o si es que no tienen.

Cuando el plan está bien, se aplica:

```
node --env-file=.env.local scripts/cargar-stock-semanal.mjs --ejecutar
```

Es una transacción: o entra todo o no entra nada. En cada producto tocado
queda el rastro en `ficha.origen.stock_semanal` (nombre del archivo) y
`ficha.origen.stock_semanal_at` (fecha de Lima), igual que el maestro2 deja
`origen.maestro2_sync`. No hay una columna `stock_actualizado_at` en
`productos` y no se creó una migración por esto.

Se puede correr fuera de las ventanas de despliegue (1 pm y 6 pm): es un
cambio de datos, no de código, y lo que ve el comercial cambia al instante.

---

## 4. Qué pasa con los códigos desconocidos

Un código que viene en el Excel y no existe en el catálogo del CRM **no se
carga y no se inventa un producto**. Sale en el bloque «En el Excel pero NO en
el catálogo», con su descripción y el número de fila, y puede ser tres cosas:

1. **Está mal escrito** (`CALE 25`, `LAVW-105`, un cero por una O). Los
   espacios y las mayúsculas se perdonan solos; el resto se corrige en el
   Excel y se vuelve a correr.
2. **Es un equipo que el CRM no tiene** (falta ficha del maestro). Se le pide
   la ficha a Lesly, se carga con el flujo del catálogo (`fichas-v-12-cargar`,
   docs/15) y la semana siguiente su stock entra solo.
3. **Es un código de otro sistema** (el de Importaciones o el del proveedor,
   no el del maestro). Hay que pedirle a Importaciones que use el código del
   maestro de Lesly, que es el único que el CRM conoce — «ya codificado todo»,
   como dijo Carlos.

Si **ninguno** de los códigos del Excel existe en el catálogo, el script se
niega a seguir: es señal de hoja equivocada o de otro sistema de códigos.

---

## 5. Pendiente

- Que Importaciones entregue el primer Excel con estas columnas (y confirme
  quién lo arma y qué día de la semana).
- Hay un producto activo sin código (`sku` nulo) que se llama «TEST / prueba
  test» (`4fe1639e-…`): parece un resto de alguna verificación que no se
  borró. Ningún Excel le va a poder dar stock; el plan lo lista cada vez hasta
  que se dé de baja.
- Cuando se cargue `inventario_equipos` (0117) el cotizador va a mostrar los
  dos números; habrá que decidir si esta cifra semanal sigue teniendo sentido o
  si Importaciones pasa a cargar series.
