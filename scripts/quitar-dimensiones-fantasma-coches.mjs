// Mismo mecanismo corregido hoy en LAV180-V1/LAV1801: `dimensionesConCapacidad`
// antepone "Capacidad: X" y arma una sección "DIMENSIONES DE LA MÁQUINA" que
// no existe en el Word de los coches (ahí la capacidad solo va en la tabla de
// cabecera, columna "Volumen"). Se marca sinCapacidadEnEspecificaciones para
// que esa sección fantasma no aparezca.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SKUS = ['CO401', 'CO402', 'CO408'];

for (const sku of SKUS) {
  const { data: producto, error: errBuscar } = await supabase
    .from('productos')
    .select('id, ficha')
    .eq('sku', sku)
    .single();
  if (errBuscar) { console.error(sku, 'no encontrado:', errBuscar.message); continue; }

  const ficha = { ...producto.ficha, sinCapacidadEnEspecificaciones: true };
  const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
  if (errUpd) { console.error(sku, 'error actualizando ficha:', errUpd.message); continue; }
  console.log(sku, '-> sinCapacidadEnEspecificaciones activado');
}
process.exit(0);
