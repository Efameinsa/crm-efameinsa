# Respaldo y restauración de datos

Exigencia de seguridad de gerencia (docs/06, demo 14-08-2026): por la experiencia previa del robo físico del servidor del ERP, gerencia pidió backup semanal + diario en un dispositivo físico, y la capacidad de restaurar en **otra plataforma** si Supabase desapareciera.

## La respuesta corta a la preocupación de Carlos

**El esquema completo de la base de datos vive en git**, en `supabase/migrations/*.sql` — cada tabla, columna, regla y función están ahí, versionados como cualquier otro archivo del proyecto. Los scripts de esta carpeta solo respaldan los **datos**. Con las dos cosas — el zip del backup + las migraciones del repositorio — se reconstruye el CRM completo en **cualquier servidor Postgres**, no solo en Supabase. No hay dependencia de un solo proveedor.

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
