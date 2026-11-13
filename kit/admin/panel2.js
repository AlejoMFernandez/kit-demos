// Panel 2.0: Inicio (el día del local), Clientes y Números, y el "día de ejemplo" del modo demo.
// Se suma al panel de siempre (admin.js): no reemplaza Pedidos ni Carta, los pone en contexto.
//   - Inicio: lo vendido hoy, los pedidos que esperan una acción, los retiros de hoy, lo que se agota, la semana.
//   - Clientes: se arma solo con cada pedido (nombre + teléfono); permite escribirles por WhatsApp uno por uno.
//   - Números: ventas de los últimos 28 días, por día de la semana, por hora, y lo más pedido.
// En modo demo, si no hay pedidos de ejemplo, siembra un mes de movimiento para que el panel se vea en uso.
import { esc, $, soloDigitos } from '../core/util.js';
import { linkWhatsApp } from '../core/pedidos.js';

const ICO = {
  inicio: '<path d="M4 11.5 12 4l8 7.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  clientes: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.900 1.900 6.500 5.500M16 5.200a3.500 3.500 0 0 1 0 6.600M18.500 14.800c1.700.800 2.700 2.500 3 5.200"/>',
  numeros: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
};
export const VISTAS2 = [
  { id: 'inicio', label: 'Inicio', icono: ICO.inicio },
  { id: 'clientes', label: 'Clientes', icono: ICO.clientes },
  { id: 'numeros', label: 'Números', icono: ICO.numeros },
];
const ACTIVOS = ['pendiente', 'confirmado', 'listo'];
const SIGUIENTE = { pendiente: ['confirmado', 'Aceptar'], confirmado: ['listo', 'Marcar listo'], listo: ['entregado', 'Entregar'] };
const ESTADO = { pendiente: 'Nuevo', confirmado: 'Preparando', listo: 'Listo' };
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ---------- día de ejemplo (solo modo demo) ----------
const NOMBRES = ['Sofía R.', 'Nicolás B.', 'Valentina G.', 'Agustina F.', 'Camila T.', 'Julián M.', 'Lucía P.', 'Martín S.', 'Florencia A.', 'Mateo D.', 'Carolina V.', 'Joaquín E.',
  'Micaela O.', 'Federico C.', 'Paula N.', 'Ignacio H.', 'Rocío L.', 'Santiago Z.', 'Daniela Q.', 'Bruno I.', 'Milagros U.', 'Franco J.', 'Abril K.', 'Lautaro W.'];
function azar(semilla) { let a = 0; for (const c of String(semilla)) a = (a * 31 + c.charCodeAt(0)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

export async function sembrarDemo(ctx) {
  const { store, config } = ctx;
  if (store.modo !== 'demo' || !config.modulos?.carrito) return false;
  if (new URLSearchParams(location.search).has('sinejemplo')) return false;   // admin/?sinejemplo abre el panel vacío (pruebas)
  const ya = await store.getPedidos();
  if (ya.some(p => p.demo)) return false;
  const prods = (await store.getProductos()).filter(p => p.precio != null && p.disponible !== false && !(Array.isArray(p.variantes) && p.variantes.length) && !p.opciones && !p.adicionales && !p.giftcard).slice(0, 24);
  if (prods.length < 3) return false;
  const r = azar(config.id || config.nombre || 'kit'); const elegir = (a, sesgo = 1.8) => a[Math.floor(Math.pow(r(), sesgo) * a.length)];
  const tipo = (config.pedidos?.tipos || ['retiro'])[0]; const pago = (config.pedidos?.pagos || config.pagos?.medios || ['whatsapp'])[0] || 'whatsapp';
  const clientes = NOMBRES.map((n, i) => ({ nombre: n, telefono: `+54 9 11 5550-${String(1000 + i * 37).slice(-4)}` }));
  const crear = async (cli, cuando, estado) => {
    const n = 1 + Math.floor(r() * 2.4); const items = []; const usados = new Set();
    for (let i = 0; i < n; i++) { const p = elegir(prods); if (usados.has(p.id)) continue; usados.add(p.id); items.push({ id: p.id, cant: 1 + Math.floor(Math.pow(r(), 2.2) * 3) }); }
    try {
      const p = await store.createPedido({ items, tipo, pago, cliente: { ...cli, direccion: '' }, nota: '' });
      await store.updatePedido(p.id, { creado: cuando.toISOString(), estado, demo: true, ...(estado === 'entregado' ? { pagoEstado: 'cobrado' } : {}) });
    } catch (_) { /* sin stock o producto no pedible: ese pedido de ejemplo no entra */ }
  };
  const ahora = new Date(); const horas = [9, 10, 11, 11, 12, 13, 15, 16, 17, 17, 17, 18, 19];
  // un cliente que venía seguido y dejó de pedir (para el aviso de "no pide hace N semanas")
  for (const d of [62, 52, 43, 36]) { const f = new Date(ahora); f.setDate(f.getDate() - d); f.setHours(17, 20, 0, 0); await crear({ nombre: 'Tomás L.', telefono: '+54 9 11 5550-0199' }, f, 'entregado'); }
  for (let d = 27; d >= 1; d--) {
    const f = new Date(ahora); f.setDate(f.getDate() - d); const finde = [0, 6].includes(f.getDay());
    for (let k = 0, n = (finde ? 7 : 5) + Math.floor(r() * 3); k < n; k++) { const c = new Date(f); c.setHours(elegir(horas, 1), Math.floor(r() * 60), 0, 0); await crear(elegir(clientes, 1.5), c, 'entregado'); }
  }
  const hace = (min) => new Date(ahora.getTime() - min * 60000);
  const pasados = Math.round(4 * Math.max(0.25, Math.min(1, (ahora.getHours() - 9) / 10)));   // lo ya entregado hoy, según la hora
  for (let k = 0; k < pasados; k++) await crear(elegir(clientes, 1.5), hace(45 + k * 38 + Math.floor(r() * 20)), 'entregado');
  if (store.cargarStock) { try { await store.cargarStock(); } catch (_) { /* sin stock diario */ } }
  await crear(clientes[6], hace(21), 'listo'); await crear(clientes[7], hace(14), 'confirmado'); await crear(clientes[4], hace(6), 'pendiente'); await crear(clientes[5], hace(2), 'pendiente');
  return true;
}

// ---------- vistas ----------
export function panel2(ctx, { hoy, render, root }) {
  const { store, config } = ctx; const money = ctx.money; const loc = ctx.pais?.locale || 'es-AR';
  const fFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.tz }); const fHora = new Intl.DateTimeFormat('en-GB', { timeZone: ctx.tz, hour: '2-digit', hour12: false });
  const fechaDe = (iso) => fFecha.format(new Date(iso)); const horaDe = (iso) => Number(fHora.format(new Date(iso)));
  const horaMin = (iso) => new Date(iso).toLocaleTimeString(loc, { timeZone: ctx.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' hs';
  const sumar = (f, d) => { const [y, m, dd] = f.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd + d)); return x.toISOString().slice(0, 10); };
  const diaSem = (f) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const validos = (ped) => ped.filter(p => !String(p.estado || '').startsWith('cancel'));
  const total = (a) => a.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const demo = store.modo === 'demo';
  const nota = demo ? ' · datos de ejemplo' : '';
  const kpi = (l, v, s = '', ok = false) => `<div class="p2-card p2-kpi"><span class="p2-kpi__l">${esc(l)}</span><b class="p2-kpi__v">${esc(v)}</b><span class="p2-kpi__s${ok ? ' is-ok' : ''}">${esc(s)}</span></div>`;
  const cab = (t, s = '') => `<div class="p2-cab"><h2>${esc(t)}</h2>${s ? `<span>${esc(s)}</span>` : ''}</div>`;
  const vacio = (t) => `<p class="p2-vacio">${esc(t)}</p>`;
  function barras(datos, { marca = -1, valor = (v) => v } = {}) {
    const mx = Math.max(1, ...datos.map(d => d.v));
    return `<div class="p2-barras" role="img" aria-label="${esc(datos.map(d => `${d.l}: ${valor(d.v)}`).join(', '))}">${datos.map((d, i) => `<div class="p2-barra${i === marca ? ' is-on' : ''}"><span class="p2-barra__v">${d.v ? esc(valor(d.v)) : ''}</span><i style="height:${Math.max(d.v ? 4 : 0, Math.round(100 * d.v / mx))}%"></i><span class="p2-barra__l">${esc(d.l)}</span></div>`).join('')}</div>`;
  }
  const corto = (n) => n >= 1e6 ? `${(n / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(Math.round(n));
  const detalle = (p) => (p.items || []).map(i => `${i.cant > 1 ? `${i.cant} × ` : ''}${i.nombre}`).join(', ');
  const topProductos = (ped) => { const m = new Map(); ped.forEach(p => (p.items || []).forEach(i => { const x = m.get(i.nombre) || { n: 0, plata: 0 }; x.n += i.cant || 1; x.plata += i.subtotal || 0; m.set(i.nombre, x); })); return [...m].map(([nombre, x]) => ({ nombre, ...x })).sort((a, b) => b.n - a.n); };

  // --- Inicio
  async function inicio(main) {
    const [todos, prods] = await Promise.all([store.getPedidos(), store.getProductos()]);
    const ped = validos(todos); const H = hoy(); const deHoy = ped.filter(p => fechaDe(p.creado) === H);
    const sem = ped.filter(p => fechaDe(p.creado) === sumar(H, -7)); const vHoy = total(deHoy); const vSem = total(sem);
    const curso = ped.filter(p => ACTIVOS.includes(p.estado)).sort((a, b) => a.creado.localeCompare(b.creado));
    const retiros = ped.filter(p => p.retiro && (p.retiro.fecha || p.retiro.dia) === H);
    const bajos = prods.filter(p => p.disponible !== false && p.stock != null && p.stock !== '' && Number(p.stock) <= 5).sort((a, b) => a.stock - b.stock).slice(0, 4);
    const top = topProductos(deHoy).slice(0, 4); const conEncargos = !!config.pedidos?.encargo;
    const clave = (p) => soloDigitos(p.cliente?.telefono || '') || String(p.cliente?.nombre || '').trim().toLowerCase(); const cliHoy = new Set(deHoy.map(clave));
    const antesDeHoy = new Set(ped.filter(p => fechaDe(p.creado) < H).map(clave)); const nuevosHoy = [...cliHoy].filter(k => !antesDeHoy.has(k)).length;
    const semana = Array.from({ length: 7 }, (_, i) => { const f = sumar(H, i - 6); return { l: i === 6 ? 'Hoy' : DIAS[diaSem(f)], v: total(ped.filter(p => fechaDe(p.creado) === f)) }; });
    const hh = horaDe(new Date().toISOString()); const saludo = hh < 13 ? 'Buen día' : hh < 20 ? 'Buenas tardes' : 'Buenas noches';
    const dif = vSem ? Math.round(100 * (vHoy - vSem) / vSem) : null;
    const fechaTxt = new Date().toLocaleDateString(loc, { timeZone: ctx.tz, weekday: 'long', day: 'numeric', month: 'long' });
    main.innerHTML = `<div class="p2">
      <header class="p2-top"><div><h1>${esc(saludo)}, ${esc(config.nombre)}</h1><p>${esc(fechaTxt.charAt(0).toUpperCase() + fechaTxt.slice(1))}${nota}</p></div>
        <div class="p2-top__acc"><a class="kit-btn kit-btn--ghost" href="#pedidos">Ver todos los pedidos</a></div></header>
      <section class="p2-kpis" aria-label="El día en números">
        ${kpi('Vendido hoy', money(vHoy), dif == null ? `${DIAS_L[diaSem(H)]} pasado: sin ventas` : `${Math.abs(dif)} % ${dif >= 0 ? 'más' : 'menos'} que el ${DIAS_L[diaSem(H)]} pasado`, dif != null && dif >= 0)}
        ${kpi('Pedidos de hoy', String(deHoy.length), curso.length ? `${curso.length} en curso ahora` : 'ninguno en curso')}
        ${kpi('Ticket promedio', deHoy.length ? money(Math.round(vHoy / deHoy.length)) : money(0), deHoy.length ? `sobre ${deHoy.length} pedidos` : 'todavía sin pedidos')}
        ${conEncargos || retiros.length ? kpi('Para retirar hoy', String(retiros.length), retiros.length ? 'encargos con día de retiro' : 'sin encargos para hoy') : kpi('Clientes de hoy', String(cliHoy.size), nuevosHoy ? `${nuevosHoy} piden por primera vez` : 'todos ya habían pedido')}
      </section>
      <div class="p2-cols">
        <section class="p2-card">${cab('Ahora', curso.length ? `${curso.length} en curso` : '')}
          ${curso.length ? curso.slice(0, 6).map(p => `<div class="p2-fila"><div class="p2-fila__t"><b>${esc(p.cliente?.nombre || 'Cliente')} · ${esc(horaMin(p.creado))}</b><span>${esc(detalle(p))}</span></div>
            <span class="p2-chip p2-chip--${esc(p.estado)}">${esc(ESTADO[p.estado])}</span>
            <button type="button" class="kit-btn${p.estado === 'pendiente' ? '' : ' kit-btn--ghost'}" data-p2-estado="${esc(p.id)}" data-a="${SIGUIENTE[p.estado][0]}">${SIGUIENTE[p.estado][1]}</button></div>`).join('') : vacio('No hay pedidos esperando. Cuando entre uno desde la web, aparece acá.')}
        </section>
        <div class="p2-lado">
          ${retiros.length ? `<section class="p2-card">${cab('Para retirar hoy')}${retiros.slice(0, 5).map(p => `<div class="p2-fila"><b class="p2-hora">${esc(p.retiro.franja || p.retiro.hora || '')}</b><div class="p2-fila__t"><b>${esc(detalle(p))}</b><span>${esc(p.cliente?.nombre || '')}${p.estado === 'entregado' ? ' · ya retirado' : ' · falta retirar'}</span></div></div>`).join('')}</section>` : ''}
          ${bajos.length ? `<section class="p2-card">${cab('Se está agotando')}${bajos.map(p => `<div class="p2-fila"><div class="p2-fila__t"><b>${esc(p.nombre)}</b><span class="p2-aviso">${Number(p.stock) > 0 ? `Quedan ${Number(p.stock)}` : 'Sin stock'}</span></div><button type="button" class="kit-btn kit-btn--ghost" data-p2-agotar="${esc(p.id)}">Marcar agotado</button></div>`).join('')}</section>` : ''}
          <section class="p2-card">${cab('Lo más pedido hoy')}${top.length ? top.map(x => `<div class="p2-fila"><b class="p2-hora">${x.n}</b><div class="p2-fila__t"><b>${esc(x.nombre)}</b><span>${esc(money(x.plata))}</span></div></div>`).join('') : vacio('Todavía no hay pedidos hoy.')}</section>
        </div>
      </div>
      <section class="p2-card">${cab('La semana', 'ventas por día')}${barras(semana, { marca: 6, valor: corto })}</section>
    </div>`;
  }

  // --- Clientes
  function agrupar(ped) {
    const m = new Map();
    ped.forEach(p => { const tel = soloDigitos(p.cliente?.telefono || ''); const k = tel || String(p.cliente?.nombre || '').trim().toLowerCase(); if (!k) return;
      const c = m.get(k) || { nombre: p.cliente?.nombre || 'Cliente', tel: p.cliente?.telefono || '', n: 0, plata: 0, primero: p.creado, ultimo: p.creado };
      c.n++; c.plata += Number(p.total) || 0; if (p.creado < c.primero) c.primero = p.creado; if (p.creado > c.ultimo) { c.ultimo = p.creado; c.nombre = p.cliente?.nombre || c.nombre; } m.set(k, c); });
    return [...m.values()];
  }
  const dias = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  const haceTxt = (d) => d <= 0 ? 'hoy' : d === 1 ? 'ayer' : d < 14 ? `hace ${d} días` : `hace ${Math.round(d / 7)} semanas`;
  async function clientes(main) {
    const ped = validos(await store.getPedidos()); const cl = agrupar(ped).sort((a, b) => b.n - a.n || b.plata - a.plata);
    const nuevos = cl.filter(c => dias(c.primero) <= 30).length; const vuelven = cl.filter(c => c.n >= 2).length;
    const dormidos = cl.filter(c => c.n >= 3 && dias(c.ultimo) >= 21 && dias(c.ultimo) > 2.5 * (dias(c.primero) - dias(c.ultimo)) / (c.n - 1)).sort((a, b) => b.n - a.n).slice(0, 3);
    const porDia = Array.from({ length: 7 }, (_, d) => ped.filter(p => diaSem(fechaDe(p.creado)) === d).length); const mejor = porDia.indexOf(Math.max(...porDia));
    const porHora = new Map(); ped.forEach(p => { const x = horaDe(p.creado); porHora.set(x, (porHora.get(x) || 0) + 1); }); const pico = [...porHora].sort((a, b) => b[1] - a[1])[0];
    const avisos = [
      ...dormidos.map(c => [`${c.nombre} no pide ${haceTxt(dias(c.ultimo))}`, `Hizo ${c.n} pedidos y dejó de venir. Un mensaje con algo nuevo puede traerlo de vuelta.`]),
      ped.length >= 10 ? [`Tu mejor día es el ${DIAS_L[mejor]}`, `Es cuando más pedidos entran${pico ? `, y la hora más fuerte es a las ${pico[0]}:00 hs` : ''}. Conviene tener todo listo para ese momento.`] : null,
    ].filter(Boolean);
    main.innerHTML = `<div class="p2">
      <header class="p2-top"><div><h1>Tus clientes</h1><p>Se arma solo con cada pedido de la web${nota}</p></div></header>
      <section class="p2-kpis p2-kpis--3" aria-label="Resumen">
        ${kpi('Clientes en la lista', String(cl.length), `${nuevos} nuevos en los últimos 30 días`, nuevos > 0)}
        ${kpi('Volvieron a pedir', cl.length ? `${Math.round(100 * vuelven / cl.length)} %` : '0 %', `${vuelven} clientes con 2 pedidos o más`)}
        ${kpi('Pedidos por cliente', cl.length ? (ped.length / cl.length).toLocaleString(loc, { maximumFractionDigits: 1 }) : '0', 'en promedio')}
      </section>
      <div class="p2-cols p2-cols--ancha">
        <section class="p2-card">${cab('Los que más vuelven', cl.length > 12 ? `12 de ${cl.length}` : '')}
          ${cl.length ? `<div class="p2-tabla"><table><thead><tr><th scope="col">Cliente</th><th scope="col">Pedidos</th><th scope="col">Último</th><th scope="col">Gastó</th><th scope="col"><span class="kit-sr">Escribirle</span></th></tr></thead><tbody>
            ${cl.slice(0, 12).map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td>${c.n}</td><td>${esc(haceTxt(dias(c.ultimo)))}</td><td><b>${esc(money(c.plata))}</b></td><td>${soloDigitos(c.tel) ? `<button type="button" class="kit-btn kit-btn--ghost" data-p2-wa="${esc(c.tel)}" data-n="${esc(c.nombre)}">Escribirle</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : vacio('Cuando entren pedidos desde la web, tus clientes aparecen acá con su historial.')}
        </section>
        <div class="p2-lado">
          <section class="p2-card">${cab('Avisar una novedad')}
            <label class="kit-field"><span>Mensaje para tus clientes</span><textarea data-p2-msg rows="4" placeholder="Ej.: ¡Hola! Este finde tenemos algo nuevo. Te lo guardamos si nos avisás."></textarea></label>
            <p class="p2-ayuda">Escribí el mensaje y tocá "Escribirle" en cada cliente: se abre su WhatsApp con el texto listo para enviar.</p></section>
          ${avisos.length ? `<section class="p2-card">${cab('El panel te avisa')}<div class="p2-avisos">${avisos.map(([a, b]) => `<div class="p2-idea"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join('')}</div></section>` : ''}
        </div>
      </div></div>`;
  }

  // --- Números
  async function numeros(main) {
    const ped = validos(await store.getPedidos()); const H = hoy(); const desde = sumar(H, -27); const antes = sumar(H, -55);
    const act = ped.filter(p => fechaDe(p.creado) >= desde); const prev = ped.filter(p => { const f = fechaDe(p.creado); return f >= antes && f < desde; });
    const v = total(act); const vp = total(prev); const dif = vp && prev.length >= 10 ? Math.round(100 * (v - vp) / vp) : null;   // con pocos pedidos antes, comparar no dice nada
    const dias14 = Array.from({ length: 14 }, (_, i) => { const f = sumar(H, i - 13); return { l: i === 13 ? 'Hoy' : String(Number(f.slice(8))), v: total(act.filter(p => fechaDe(p.creado) === f)) }; });
    const porDia = Array.from({ length: 7 }, (_, k) => { const d = (k + 1) % 7; return { l: DIAS[d], v: total(act.filter(p => diaSem(fechaDe(p.creado)) === d)) }; });
    const hs = act.map(p => horaDe(p.creado)); const h0 = hs.length ? Math.min(...hs) : 9; const h1 = hs.length ? Math.max(...hs) : 20;
    const porHora = Array.from({ length: Math.min(14, h1 - h0 + 1) }, (_, i) => ({ l: String(h0 + i), v: hs.filter(x => x === h0 + i).length }));
    const top = topProductos(act).slice(0, 8); const mxT = Math.max(1, ...top.map(x => x.n));
    const iMax = (a) => a.reduce((m, d, i) => d.v > a[m].v ? i : m, 0);
    main.innerHTML = `<div class="p2">
      <header class="p2-top"><div><h1>Tus números</h1><p>Últimos 28 días${nota}</p></div></header>
      <section class="p2-kpis p2-kpis--3" aria-label="Resumen">
        ${kpi('Vendido', money(v), dif == null ? 'sin datos de los 28 días anteriores' : `${Math.abs(dif)} % ${dif >= 0 ? 'más' : 'menos'} que los 28 días anteriores`, dif != null && dif >= 0)}
        ${kpi('Pedidos', String(act.length), act.length ? `${(act.length / 28).toLocaleString(loc, { maximumFractionDigits: 1 })} por día` : 'todavía sin pedidos')}
        ${kpi('Ticket promedio', act.length ? money(Math.round(v / act.length)) : money(0), '')}
      </section>
      <section class="p2-card">${cab('Ventas por día', 'últimas 2 semanas')}${barras(dias14, { marca: 13, valor: corto })}</section>
      <div class="p2-cols p2-cols--par">
        <section class="p2-card">${cab('Qué días vendés más', 'total por día de la semana')}${barras(porDia, { marca: iMax(porDia), valor: corto })}</section>
        <section class="p2-card">${cab('A qué hora te piden', 'pedidos por hora')}${barras(porHora, { marca: porHora.length ? iMax(porHora) : -1 })}</section>
      </div>
      <section class="p2-card">${cab('Lo más pedido', 'unidades y ventas')}
        ${top.length ? top.map(x => `<div class="p2-rank"><span class="p2-rank__n">${esc(x.nombre)}</span><div class="p2-rank__b"><i style="width:${Math.round(100 * x.n / mxT)}%"></i></div><b>${x.n}</b><span class="p2-rank__p">${esc(money(x.plata))}</span></div>`).join('') : vacio('Todavía no hay pedidos para mostrar.')}
      </section></div>`;
  }

  // --- acciones
  root.addEventListener('click', async (e) => {
    const est = e.target.closest('[data-p2-estado]');
    if (est) { est.classList.add('is-loading'); est.disabled = true; await store.updatePedido(est.dataset.p2Estado, { estado: est.dataset.a, ...(est.dataset.a === 'entregado' ? { pagoEstado: 'cobrado' } : {}) }); render(); return; }
    const ag = e.target.closest('[data-p2-agotar]');
    if (ag) { ag.classList.add('is-loading'); ag.disabled = true; const p = (await store.getProductos()).find(x => x.id === ag.dataset.p2Agotar); if (p) await store.saveProducto({ ...p, disponible: false }); render(); return; }
    const wa = e.target.closest('[data-p2-wa]');
    if (wa) { const msg = ($('[data-p2-msg]', root)?.value || '').trim() || `¡Hola ${wa.dataset.n.split(' ')[0]}! Te escribimos de ${config.nombre}.`; const l = linkWhatsApp(wa.dataset.p2Wa, msg); if (l.url) window.open(l.url, '_blank', 'noopener'); }
  });

  return { inicio, clientes, numeros };
}
