// Santos, 02-09: «Mi parque» solo para Ariana (y postventa). La llave que lo
// abre es `hace_postventa` (0093/0116), la misma que reparte Lesly desde
// /operaciones/permisos. Se le abre a Ariana con constancia de quién y cuándo.
import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const { rows } = await bd.query(`update perfiles set hace_postventa = true, mantenimiento_desde = coalesce(mantenimiento_desde, current_date), mantenimiento_por = coalesce(mantenimiento_por, (select id from perfiles where nombre ilike 'Santos%' limit 1)) where codigo_comercial = 'C4' and rol = 'comercial' returning nombre, hace_postventa, mantenimiento_desde`);
console.log(rows);
await bd.end();
