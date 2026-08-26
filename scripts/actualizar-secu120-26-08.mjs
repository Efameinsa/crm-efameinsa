import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const cambios = [
  {
    sku: 'SECU1202',
    descripcion_maestro: 'SECADORA INDUSTRIAL, MOD: UT120L, CAP: 55KG, CONTROL: UNLINC TOUCH, DOBLE ROTACION, CILINDRO INOXIDABLE, CALENTAMIENTO: GAS GLP, PANEL ESTÁNDAR, C/ OPTIDRY, Q(220V/60HZ/ 3PH)',
    precio: 21500,
  },
  {
    sku: 'SECU120',
    descripcion_maestro: 'SECADORA INDUSTRIAL, MOD: UT120L, CAP: 55KG, CONTROL: DUAL DIGITAL, DOBLE ROTACION, CILINDRO GALVANIZADO, CALENTAMIENTO: GAS GLP, PANEL ESTÁNDAR, Q(220V/60HZ/ 3PH)',
    precio: null,
  },
  {
    sku: 'SECU120E',
    descripcion_maestro: 'SECADORA INDUSTRIAL, MOD: UT120L, CAP: 55KG, CONTROL: DUAL DIGITAL, DOBLE ROTACION, CILINDRO GALVANIZADO, CALENTAMIENTO: ELECTRICO, PANEL ESTÁNDAR, Q(220V/60HZ/ 3PH)',
    precio: null,
  },
  {
    sku: 'SECU120E2',
    descripcion_maestro: 'SECADORA INDUSTRIAL, MOD: UT120L, CAP: 55KG, CONTROL: DUAL DIGITAL, DOBLE ROTACION, CILINDRO GALVANIZADO, CALENTAMIENTO: ELECTRICO, PANEL ESTÁNDAR,P(380V/60HZ/ 3PH)',
    precio: null,
  },
];

for (const c of cambios) {
  const { data: producto, error: errBuscar } = await supabase
    .from('productos')
    .select('id, ficha')
    .eq('sku', c.sku)
    .single();
  if (errBuscar) { console.error(c.sku, 'no encontrado:', errBuscar.message); continue; }

  const ficha = { ...producto.ficha, descripcion_maestro: c.descripcion_maestro };
  const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
  if (errUpd) { console.error(c.sku, 'error actualizando ficha:', errUpd.message); continue; }
  console.log(c.sku, '-> descripcion_maestro actualizada (CAP 55KG)');

  if (c.precio !== null) {
    const { error: errPrecio } = await supabase
      .from('precios_producto')
      .update({ precio: c.precio })
      .eq('producto_id', producto.id)
      .eq('tier', 'base')
      .is('vigente_hasta', null);
    if (errPrecio) { console.error(c.sku, 'error actualizando precio:', errPrecio.message); continue; }
    console.log(c.sku, '-> precio actualizado a', c.precio);
  }
}
process.exit(0);
