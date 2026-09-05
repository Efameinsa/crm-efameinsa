# Respaldo y restauración de datos

Exigencia de seguridad de gerencia (docs/06, demo 14-08-2026): por la experiencia previa del robo físico del servidor del ERP, gerencia pidió backup semanal + diario en un dispositivo físico, y la capacidad de restaurar en **otra plataforma** si Supabase desapareciera.

## La respuesta corta a la preocupación de Carlos

Con `scripts/respaldo-completo.mjs` (ver más abajo) **un solo zip contiene todo**: el esquema tal como corre hoy, los datos, los usuarios, los adjuntos y el programa entero con su historial. Se reconstruye el CRM en **cualquier servidor Postgres**, no solo en Supabase. No hay dependencia de un solo proveedor.

> **Corrección del 05-09-2026.** Hasta esa fecha acá decía que el esquema completo vivía en git, en `supabase/migrations/*.sql`. Es casi cierto y ya no alcanza: **varias funciones se parchan en caliente sobre la definición viva** (es la práctica del repo, ver `crm-no-copiar-funciones-cotizacion`), así que el `.sql` de una migración puede no ser lo que corre en producción. Por eso el respaldo completo lee el **catálogo vivo** y no las migraciones.

## Cómo funciona

No se asume `pg_dump` instalado (no lo está en este equipo). Todo corre en Node con el paquete `pg`, ya usado por `scripts/aplicar-migracion.mjs`.

### `scripts/backup-datos.mjs`

```
npm run db:backup
```

1. Se conecta con `DATABASE_URL` y lista todas las tablas de `public`.
2. Vuelca cada tabla completa a NDJSON (una fila = una línea JSON) en `backups/{YYYY-MM-DD}/{tabla}.ndjson`.
3. Escribe `backups/{YYYY-MM-DD}/manifiesto.json` con la fecha, el conteo de filas por tabla y la migración más alta aplicada (para saber contra qué versión del esquema corresponde el backup).
4. Comprime la carpeta a `backups/backup-{YYYY-MM-DD}.zip` con `Compress-Archive` de PowerShell y borra la carpeta suelta.
5. Imprime la ruta y el tamaño final.

`backups/` está en `.gitignore` — los datos de clientes NUNCA se suben al repositorio.

### `scripts/restaurar-datos.mjs`

```
node --env-file=.env.local scripts/restaurar-datos.mjs --archivo backups/backup-2026-08-14.zip --confirmo-sobrescribir
```

1. Descomprime el zip a una carpeta temporal.
2. Trunca **todas** las tablas encontradas en el backup (`TRUNCATE ... RESTART IDENTITY CASCADE`) y vuelve a insertar cada fila, con `session_replication_role = replica` (desactiva triggers y validación de llaves foráneas mientras carga, así el orden de las tablas no importa y no se disparan triggers de negocio con datos históricos).
3. Como no hay entrada interactiva en este entorno (sin stdin), la confirmación es el flag `--confirmo-sobrescribir` — sin él el script se niega a correr.

**PELIGRO**: este script sobreescribe por completo la base a la que apunta `DATABASE_URL`. Nunca se prueba contra producción — solo contra una base local o una rama de desarrollo aparte. Para reconstruir todo desde cero en un Postgres nuevo (ej. tras perder Supabase): crear la base, correr `npm run db:migrar` con el `DATABASE_URL` nuevo apuntando ahí (recrea el esquema completo desde `supabase/migrations/`), y luego `npm run db:restaurar -- --archivo <zip> --confirmo-sobrescribir` para cargar los datos.

## Política de respaldo

- **Diario automático**, todos los días a las 8:00 p.m.
- **Copia semanal a un dispositivo físico externo** (USB/disco externo, no en la misma máquina que corre el CRM) — cubre el escenario de robo físico que ya vivieron con el servidor del ERP.

### Programar el backup diario en Windows

Comando exacto (ajustar la ruta del proyecto si cambia):

```
schtasks /create /sc daily /tn "Backup CRM Efameinsa" /tr "node --env-file=C:\ruta\al\proyecto\.env.local C:\ruta\al\proyecto\scripts\backup-datos.mjs" /st 20:00
```

### Copia semanal a disco físico

Una vez por semana, copiar manualmente (o con una tarea programada semanal adicional apuntando a la letra de unidad del disco externo) el contenido de `backups/` — o al menos el `.zip` más reciente — al dispositivo físico. No se automatiza el "conectar el disco": es un paso manual a propósito, para forzar que alguien lo revise.

## Verificación

Antes de dar por buena la política:
1. Correr un backup real (`npm run db:backup`) y comprobar que el conteo de filas del `manifiesto.json` coincide con lo que hay en la base.
2. Probar la restauración **contra una base local o una rama de desarrollo, nunca contra producción**. Si no hay un Postgres local disponible en el equipo donde se verifica, se deja la restauración documentada como "probada en seco": se confirma que el zip descomprime correctamente y que el NDJSON de cada tabla es JSON válido con el conteo de filas esperado, y se corre el flujo de restauración completo en cuanto haya un Postgres de prueba disponible.

## El respaldo completo (desde el 05-09-2026)

```
node --env-file=.env.local scripts/respaldo-completo.mjs
```

El respaldo de arriba (`npm run db:backup`) guarda las **filas** y nada más. Alcanza para recuperar un dato borrado, pero no para llevarse el CRM a otra parte: deja fuera el esquema vivo, los usuarios que inician sesión, los adjuntos y las 121 funciones donde vive la mitad de las reglas del negocio.

El respaldo completo deja en `backups/respaldo-completo-{YYYY-MM-DD}/`:

| Carpeta | Qué trae |
|---|---|
| `base/esquema/` | 10 archivos `.sql` leídos del **catálogo vivo**: extensiones, 25 enums, 52 tablas, 80 índices, 3 vistas, 121 funciones, 33 triggers, 117 políticas RLS, permisos y comentarios |
| `base/datos/` | las 52 tablas en NDJSON, más `auth.users`, `auth.identities` y el inventario de storage |
| `archivos/` | los adjuntos de verdad, bajados uno por uno con la llave de servicio |
| `codigo/` | un `git bundle` con **todo el historial y todas las ramas**, más lo que estaba sin commitear |

Dos detalles que costaron encontrar y conviene no volver a descubrir:

- **Las 52 tablas se vuelcan dentro de una sola transacción `repeatable read`**, así que son la foto del mismo instante. Sin eso el respaldo es una colcha de retazos: puede quedar un cierre sin su venta.
- **Se va por tandas, con un cursor del servidor.** `select * from leads` de un tirón son 20 MB y el pooler de Supabase corta la conexión a medio camino.

Los **secretos van en un zip aparte** (`crm-efameinsa-SECRETOS-{fecha}.zip`), para que el respaldo se pueda entregar a un tercero —una consultora evaluando arquitectura, por ejemplo— sin regalar el acceso a producción.

### Cómo se comprueba que el respaldo sirve

`scripts/ensayar-restauracion.mjs` levanta el esquema entero en un esquema temporal de la propia base y lo deshace al final. No necesita otro Postgres a mano ni toca producción.

El 05-09-2026 reconstruyó las 52 tablas, 121 funciones, 117 políticas, 150 índices, 3 vistas y 33 triggers **sin un solo error**. También quedó comprobado que las 146.836 líneas NDJSON son JSON válido, que los 101 adjuntos son archivos reales (55 JPEG, 37 PDF, 7 PNG, 2 ZIP) y que el bundle de git verifica con historial completo.

Una trampa que apareció en ese ensayo: `pg_trgm` y `uuid-ossp` están instaladas **dentro de `public`** y dejan ahí un centenar de funciones en C. Copiarlas al respaldo hacía fallar la restauración con `permission denied for language c`. El respaldo ahora excluye lo que pertenece a una extensión: eso lo repone el `create extension` del paso 01.
