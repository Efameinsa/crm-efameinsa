// Modificacion de precio y capacidad secadora ut120 26.08.26.xlsx (V:\LESLY),
// hoja "SECADORA UT75". La hoja "SECADORA UT120" es igual a lo ya aplicado
// el 26-08 (script actualizar-secu120-26-08.mjs) — solo cambia precio acá.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const precios = [
  { sku: 'SECU553', precio: 8500 },
  { sku: 'SECU75', precio: 7850 },
  { sku: 'SEC75E3', precio: 9150 },
];

for (const { sku, precio } of precios) {
  const { data: producto, error: errBuscar } = await supabase
    .from('productos')
    .select('id')
    .eq('sku', sku)
    .single();
  if (errBuscar) { console.error(sku, 'no encontrado:', errBuscar.message); continue; }

  const { error: errPrecio } = await supabase
    .from('precios_producto')
    .update({ precio })
    .eq('producto_id', producto.id)
    .eq('tier', 'base')
    .is('vigente_hasta', null);
  if (errPrecio) { console.error(sku, 'error actualizando precio:', errPrecio.message); continue; }
  console.log(sku, '-> precio actualizado a', precio);
}
process.exit(0);
