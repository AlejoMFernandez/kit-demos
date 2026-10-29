// Adaptador DEMO: todo en localStorage del visitante.
// Cada persona que abre la demo tiene su propia "caja de arena": sin backend ni costo.
// Se siembra con la carta de cliente.json y se puede reiniciar desde el panel.
import { uid, clone, codigoCorto } from '../core/util.js';
import { armarPedido } from '../core/pedidos.js';
import { faltantes, cantidadesPorProducto, ocupacionFranjas, stockDe } from '../core/stock.js';
import { tieneVariantes } from '../core/variantes.js';
import { configReservas, serviciosDe, tandaDe, usadosEn, capacidadEn } from '../core/turnos.js';
import { temporadaValida } from '../core/temporadas.js';
import { descuentoEfectivo } from '../core/descuentos.js';
import { configEstadias, ocupacionDemo, libre, nochesEntre, cotizar, ACTIVA } from '../core/estadias.js';
import { ahoraEn } from '../core/turnos.js';
import { mezclarDestacados } from '../core/destacados.js';
import { configCanchas, ocupacionDemo as ocupacionDemoCanchas, abonosDemo, ocupacionDia, libre as canchaLibre, ACTIVO as TURNO_ACTIVO, cotizar as cotizarCancha, tarifasDe as tarifasCanchas, ocupaDe, deporteDe } from '../core/canchas.js';
import { configGiftcards, codigoGiftcard, normalizarCodigo, estadoGiftcard, canjeable, venceDesde } from '../core/giftcards.js';

const VERSION = 1;

export function createLocalStore(config) {
  const KEY = `kit:${config.id}:v${VERSION}`;
  const canal = ('BroadcastChannel' in self) ? new BroadcastChannel(KEY) : null;
  const subs = new Set();

  function semilla() {
    const c = clone(config.carta || { categorias: [], productos: [] });
    return {
      categorias: (c.categorias || []).map((x, i) => ({ orden: i + 1, ...x })),
      productos: (c.productos || []).map((x, i) => ({ disponible: true, etiquetas: [], descripcion: '', orden: i + 1, ...x })),
      temporada: temporadaValida(config, null), reservas: [], pedidos: [], giftcards: [], sembrado: new Date().toISOString(),
      ...(config.modulos?.estadias ? semillaEstadias() : {}),
      ...(config.modulos?.canchas ? semillaCanchas() : {}),
    };
  }
  function semillaEstadias() {
    const E = configEstadias(config);
    return { estadias: config.estadias?.demoOcupacion === false ? [] : ocupacionDemo(E, ahoraEn(config.zonaHoraria || 'America/Argentina/Buenos_Aires').fecha),
      tarifas: clone({ ...E.tarifas, sena: E.sena, minNoches: E.minNoches }) };
  }
  function semillaCanchas() {
    const C = configCanchas(config); const now = ahoraEn(config.zonaHoraria || 'America/Argentina/Buenos_Aires');
    const abonos = config.canchas?.demoOcupacion === false ? [] : abonosDemo(C);
    return { turnosCancha: config.canchas?.demoOcupacion === false ? [] : ocupacionDemoCanchas(C, config.horarios, now.fecha, now.min, abonos), abonosCancha: abonos, tarifasCancha: null, canchasHoy: now.fecha };
  }
  function leer() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (_) { /* dato roto → resembrar */ }
    const s = semilla(); escribir(s, false); return s;
  }
  function escribir(db, avisar = true) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {
      const err = new Error('quota'); err.code = 'quota'; throw err;
    }
    if (avisar) emitir();
  }
  function emitir(origen = 'local') { subs.forEach(fn => fn({ origen })); if (origen === 'local' && canal) canal.postMessage('cambio'); }
  if (canal) canal.onmessage = () => emitir('otra-pestaña');
  self.addEventListener('storage', (e) => { if (e.key === KEY) emitir('otra-pestaña'); });

  const leerE = () => { const db = leer(); if (config.modulos?.estadias && !db.estadias) { Object.assign(db, semillaEstadias()); escribir(db, false); } if (config.modulos?.canchas) {
      if (!db.turnosCancha) { Object.assign(db, semillaCanchas()); escribir(db, false); }
      else if (config.canchas?.demoOcupacion !== false && db.canchasHoy !== ahoraEn(config.zonaHoraria || 'America/Argentina/Buenos_Aires').fecha) {
        // otro día: la ocupación de ejemplo se rearma alrededor de hoy (lo que cargó el visitante se respeta)
        const C = configCanchas(config); const now = ahoraEn(config.zonaHoraria || 'America/Argentina/Buenos_Aires');
        const propios = db.turnosCancha.filter(x => !x.demo);
        const demo = ocupacionDemoCanchas(C, config.horarios, now.fecha, now.min, db.abonosCancha || []).filter(x => canchaLibre(propios.filter(TURNO_ACTIVO), x.canchas, x.fecha, x.desde, x.hasta));
        db.turnosCancha = [...propios, ...demo]; db.canchasHoy = now.fecha; escribir(db, false);
      }
    }
    return db; };
  const mut = (fn) => { const db = leerE(); db.giftcards = db.giftcards || []; const r = fn(db); escribir(db); return r; };
  const GC = configGiftcards(config);
  const conEstado = (g) => g && ({ ...g, estado: estadoGiftcard(g) });
  function activar(db, pedidoId) {
    (db.giftcards || []).filter(g => g.pedidoId === pedidoId && g.estado === 'pendiente').forEach(g => {
      g.estado = 'vigente'; g.activada = new Date().toISOString(); g.vence = venceDesde(GC?.validezDias);
    });
  }
  const ordenar = (a) => a.slice().sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));

  return {
    modo: 'demo',

    // ---- carta
    async getCategorias() { return ordenar(leer().categorias); },
    async saveCategoria(cat) {
      return mut(db => {
        const i = db.categorias.findIndex(c => c.id === cat.id);
        if (i >= 0) db.categorias[i] = { ...db.categorias[i], ...cat };
        else db.categorias.push({ orden: db.categorias.length + 1, ...cat, id: cat.id || uid('c-').slice(0, 12) });
        return cat;
      });
    },
    async deleteCategoria(id) { return mut(db => { db.categorias = db.categorias.filter(c => c.id !== id); db.productos.forEach(p => { if (p.categoria === id) p.categoria = null; }); }); },
    async getProductos() { return ordenar(leer().productos); },
    // temporada de la carta que se ve en la web (null si el negocio no usa temporadas)
    async getTemporada() { return temporadaValida(config, leer().temporada); },
    // destacados editables (kit 1.11): { id: { campo: valor } }
    async getDestacados() { return mezclarDestacados(config, leer().destacados || {}); },
    async saveDestacado(id, valores) { return mut(db => { db.destacados = { ...(db.destacados || {}), [id]: { ...valores } }; return mezclarDestacados(config, db.destacados)[id]; }); },
    async setTemporada(id) { return mut(db => { db.temporada = temporadaValida(config, id); return db.temporada; }); },
    async saveProducto(p) {
      return mut(db => {
        const i = db.productos.findIndex(x => x.id === p.id);
        const limpio = { ...p, precio: p.precio === '' || p.precio == null ? null : Number(p.precio) };
        if (i >= 0) db.productos[i] = { ...db.productos[i], ...limpio };
        else db.productos.push({ disponible: true, etiquetas: [], orden: db.productos.length + 1, ...limpio, id: p.id || uid('p-').slice(0, 12) });
        return limpio;
      });
    },
    async deleteProducto(id) { return mut(db => { db.productos = db.productos.filter(p => p.id !== id); }); },
    // En demo la foto se achica en el navegador y se guarda como data URL.
    async uploadFoto(file) { return achicarImagen(file, 900, .82); },

    // ---- reservas
    async getOcupacion(fecha) {
      const o = {};
      leer().reservas.filter(r => r.fecha === fecha && !['cancelada', 'no_vino'].includes(r.estado)).forEach(r => { o[r.hora] = (o[r.hora] || 0) + r.personas; });
      return o;
    },
    async createReserva(data) {
      const cfg = configReservas(config.reservas);
      return mut(db => {
        const pers = Number(data.personas);
        if (!(pers >= 1 && pers <= cfg.maxPersonas)) throw Object.assign(new Error('personas'), { code: 'personas' });
        const td = serviciosDe(cfg) ? tandaDe(cfg, data.hora) : null;
        if (serviciosDe(cfg) && !td) throw Object.assign(new Error('hora'), { code: 'hora' });
        const ocup = {};
        db.reservas.filter(r => r.fecha === data.fecha && !['cancelada', 'no_vino'].includes(r.estado)).forEach(r => { ocup[r.hora] = (ocup[r.hora] || 0) + r.personas; });
        if (usadosEn(cfg, data.hora, ocup) + pers > capacidadEn(cfg, data.hora)) throw Object.assign(new Error('sin_lugar'), { code: 'sin_lugar' });
        const extras = Array.isArray(data.extras) ? data.extras.filter(x => (cfg.extras || []).some(e => e.id === x)) : [];
        const r = { id: uid('r-'), fecha: data.fecha, hora: data.hora, personas: pers, nombre: data.nombre, telefono: data.telefono, email: data.email || '', comentario: data.comentario || '',
          ...(td ? { servicio: td.servicio.id } : {}), ...(extras.length ? { extras } : {}), estado: 'pendiente', creado: new Date().toISOString() };
        db.reservas.push(r); return r;
      });
    },
    async getReservas() { return leer().reservas.slice().sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)); },
    async updateReserva(id, patch) { return mut(db => { const r = db.reservas.find(x => x.id === id); if (r) Object.assign(r, patch); return r; }); },

    // ---- estadías (alojamientos)
    async getEstadias() { return (leerE().estadias || []).slice().sort((a, b) => a.llegada.localeCompare(b.llegada)); },
    async getOcupacionEstadias() { return (leerE().estadias || []).filter(ACTIVA).map(e => ({ habitacion: e.habitacion, llegada: e.llegada, salida: e.salida })); },
    async getTarifas() { const E = configEstadias(config); return { ...clone(E.tarifas), sena: E.sena, minNoches: E.minNoches, ...(leerE().tarifas || {}) }; },
    async saveTarifas(tf) { return mut(db => { db.tarifas = clone(tf); return db.tarifas; }); },
    async createEstadia(data) {
      const E = configEstadias(config);
      return mut(db => {
        db.estadias = db.estadias || [];
        if (!E.habitaciones.some(h => h.id === data.habitacion)) throw Object.assign(new Error('habitacion'), { code: 'habitacion' });
        if (!(data.llegada < data.salida)) throw Object.assign(new Error('fechas'), { code: 'fechas' });
        if (!libre(db.estadias, data.habitacion, data.llegada, data.salida)) throw Object.assign(new Error('sin_lugar'), { code: 'sin_lugar' });
        const bloqueo = data.origen === 'bloqueo';
        const q = bloqueo ? { total: null, sena: null } : cotizar(E, db.tarifas || E.tarifas, data.habitacion, data.llegada, data.salida);
        const e = { id: uid('e-'), codigo: bloqueo ? '' : codigoCorto(config.prefijoPedido || 'CC'), habitacion: data.habitacion, llegada: data.llegada, salida: data.salida,
          noches: nochesEntre(data.llegada, data.salida).length, huespedes: Number(data.huespedes) || 2, nombre: data.nombre || '', telefono: data.telefono || '', email: data.email || '',
          horaLlegada: data.horaLlegada || '', comentario: data.comentario || '', total: q.total, sena: data.pago === 'mercadopago' ? q.sena : null,
          origen: data.origen || 'web', pago: data.pago || 'whatsapp', pagoEstado: data.pago === 'mercadopago' ? 'pendiente' : 'a_coordinar',
          estado: data.estado || (bloqueo || data.origen === 'manual' ? 'confirmada' : 'pendiente'), creado: new Date().toISOString() };
        db.estadias.push(e); return e;
      });
    },
    async updateEstadia(id, patch) {
      return mut(db => {
        const e = (db.estadias || []).find(x => x.id === id); if (!e) return null;
        const prox = { ...e, ...patch };
        if ((patch.llegada || patch.salida || patch.habitacion || (patch.estado && patch.estado !== 'cancelada')) && ACTIVA(prox) && !libre(db.estadias, prox.habitacion, prox.llegada, prox.salida, id)) throw Object.assign(new Error('sin_lugar'), { code: 'sin_lugar' });
        Object.assign(e, patch, patch.llegada || patch.salida ? { noches: nochesEntre(prox.llegada, prox.salida).length } : {});
        return e;
      });
    },
    async deleteEstadia(id) { return mut(db => { db.estadias = (db.estadias || []).filter(x => x.id !== id); }); },
    async getEstadiaPublica(id) { const e = (leerE().estadias || []).find(x => x.id === id); return e ? { id: e.id, codigo: e.codigo, estado: e.estado, pagoEstado: e.pagoEstado, sena: e.sena, total: e.total, llegada: e.llegada, salida: e.salida, habitacion: e.habitacion, nombre: e.nombre } : null; },

    // ---- canchas (complejos deportivos)
    async getTurnosCancha() { return (leerE().turnosCancha || []).slice().sort((a, b) => (a.fecha + String(a.desde).padStart(4, '0')).localeCompare(b.fecha + String(b.desde).padStart(4, '0'))); },
    async getAbonosCancha() { return (leerE().abonosCancha || []).slice(); },
    // Ocupación pública (sin datos personales) de un rango de fechas: [{ fecha, canchas, desde, hasta }]
    async getOcupacionCanchas(desde, hasta) {
      const db = leerE(); const out = [];
      const fechas = new Set((db.turnosCancha || []).filter(x => x.fecha >= desde && x.fecha <= hasta).map(x => x.fecha));
      for (let f = desde; f <= hasta; f = new Date(Date.parse(f) + 864e5).toISOString().slice(0, 10)) fechas.add(f);
      fechas.forEach(f => ocupacionDia(db.turnosCancha, db.abonosCancha, f).forEach(o => out.push({ fecha: o.fecha, canchas: o.canchas, desde: o.desde, hasta: o.hasta })));
      return out;
    },
    async getTarifasCancha() { return tarifasCanchas(configCanchas(config), leerE().tarifasCancha || {}); },
    async saveTarifasCancha(tf) { return mut(db => { db.tarifasCancha = clone(tf); return db.tarifasCancha; }); },
    async createTurnoCancha(data) {
      const C = configCanchas(config);
      return mut(db => {
        db.turnosCancha = db.turnosCancha || [];
        const bloqueo = data.origen === 'bloqueo';
        const d = deporteDe(C, data.deporte);
        if (!bloqueo && !d) throw Object.assign(new Error('deporte'), { code: 'deporte' });
        const canchas = bloqueo ? (data.canchas || []) : ocupaDe(C, data.deporte, data.unidad);
        if (!canchas.length) throw Object.assign(new Error('cancha'), { code: 'cancha' });
        const desde = Number(data.desde); const hasta = bloqueo ? Number(data.hasta) : desde + d.duracion;
        if (!(hasta > desde)) throw Object.assign(new Error('hora'), { code: 'hora' });
        if (!bloqueo && !canchaLibre(ocupacionDia(db.turnosCancha, db.abonosCancha, data.fecha), canchas, data.fecha, desde, hasta)) throw Object.assign(new Error('sin_lugar'), { code: 'sin_lugar' });
        const tf = tarifasCanchas(C, db.tarifasCancha || {});
        const q = bloqueo ? null : cotizarCancha(C, tf, data.deporte, data.fecha, desde, data.extras || {});
        const web = !data.origen || data.origen === 'web';
        const tn = { id: uid('t-'), codigo: bloqueo ? '' : codigoCorto(config.prefijoPedido || 'CH'), deporte: data.deporte || null, unidad: data.unidad || null, canchas, fecha: data.fecha, desde, hasta,
          nombre: data.nombre || '', telefono: data.telefono || '', email: data.email || '', comentario: data.comentario || '', motivo: data.motivo || '',
          extras: q ? q.extras : [], precio: q?.precio ?? null, total: q?.total ?? null, pico: q?.pico ?? null, sena: web && data.pago === 'mercadopago' ? q?.sena ?? null : null,
          origen: data.origen || 'web', pago: data.pago || (web ? 'complejo' : 'externo'), pagoEstado: data.pago === 'mercadopago' ? 'pendiente' : 'a_coordinar',
          estado: bloqueo || !web ? 'confirmada' : 'pendiente', creado: new Date().toISOString() };
        db.turnosCancha.push(tn); return tn;
      });
    },
    async updateTurnoCancha(id, patch) {
      return mut(db => {
        const tn = (db.turnosCancha || []).find(x => x.id === id); if (!tn) return null;
        const prox = { ...tn, ...patch };
        if ((patch.fecha || patch.desde != null || patch.canchas || (patch.estado && patch.estado !== 'cancelada')) && TURNO_ACTIVO(prox) && prox.origen !== 'bloqueo'
          && !canchaLibre(ocupacionDia(db.turnosCancha, db.abonosCancha, prox.fecha), prox.canchas, prox.fecha, prox.desde, prox.hasta, id)) throw Object.assign(new Error('sin_lugar'), { code: 'sin_lugar' });
        Object.assign(tn, patch);
        if (patch.pagoEstado === 'aprobado' && tn.estado === 'pendiente') tn.estado = 'confirmada';
        return tn;
      });
    },
    async deleteTurnoCancha(id) { return mut(db => { db.turnosCancha = (db.turnosCancha || []).filter(x => x.id !== id); }); },
    async getTurnoCanchaPublico(id) { const x = (leerE().turnosCancha || []).find(y => y.id === id); return x ? { id: x.id, codigo: x.codigo, estado: x.estado, pagoEstado: x.pagoEstado, deporte: x.deporte, unidad: x.unidad, canchas: x.canchas, fecha: x.fecha, desde: x.desde, hasta: x.hasta, nombre: x.nombre, extras: x.extras, precio: x.precio, total: x.total, sena: x.sena, pico: x.pico } : null; },
    async saveAbonoCancha(ab) {
      const C = configCanchas(config);
      return mut(db => {
        db.abonosCancha = db.abonosCancha || [];
        const i = db.abonosCancha.findIndex(x => x.id === ab.id);
        const d = deporteDe(C, ab.deporte);
        const a = { estado: 'activo', liberadas: [], ...(i >= 0 ? db.abonosCancha[i] : {}), ...ab, id: ab.id || uid('ab-') };
        if (d) { a.canchas = ocupaDe(C, a.deporte, a.unidad); a.duracion = d.duracion; }
        a.hora = Number(a.hora); a.dow = Number(a.dow);
        if (i < 0) {
          // un abono nuevo no puede pisar otro abono el mismo día y hora
          const choca = db.abonosCancha.some(x => x.estado !== 'baja' && Number(x.dow) === a.dow && x.canchas.some(c => a.canchas.includes(c)) && x.hora < a.hora + a.duracion && a.hora < x.hora + x.duracion);
          if (choca) throw Object.assign(new Error('sin_lugar'), { code: 'sin_lugar' });
          db.abonosCancha.push(a);
        } else db.abonosCancha[i] = a;
        return a;
      });
    },

    // ---- pedidos
    async createPedido(data) {
      return mut(db => {
        const calc = armarPedido(db.productos.filter(p => p.precio != null || tieneVariantes(p) || config.pedidos?.sinPrecio === 'a_confirmar'), data.items, { tipo: data.tipo, pedidos: config.pedidos, descuentoPct: data.pago === 'efectivo' ? descuentoEfectivo(config) : 0, giftcards: GC, categorias: db.categorias, casillas: data.casillas || [] });
        if (!calc.items.length) throw Object.assign(new Error('vacio'), { code: 'vacio' });
        // stock del día: si no alcanza, no entra; si alcanza, se descuenta (y vuelve si el pedido se cancela)
        const conStock = !!config.carta?.stock;
        if (conStock) {
          const f = faltantes(config, db.productos, calc.items);
          if (f.length) throw Object.assign(new Error('stock'), { code: 'stock', faltantes: f });
          cantidadesPorProducto(calc.items).forEach((n, id) => { const x = db.productos.find(q => q.id === id); if (x && stockDe(config, x) != null) x.stock = stockDe(config, x) - n; });
        }
        const p = {
          id: uid('o-'), codigo: codigoCorto(config.prefijoPedido || 'PD'), ...calc,
          tipo: data.tipo, cliente: data.cliente, nota: data.nota || '', pago: data.pago, sucursal: data.sucursal || null, retiro: data.retiro || null,
          pagoEstado: data.pago === 'mercadopago' ? 'pendiente' : 'a_coordinar', estado: 'pendiente', creado: new Date().toISOString(),
          ...(conStock ? { stockDescontado: true } : {}),
        };
        db.pedidos.push(p);
        // cada gift card del pedido queda "pendiente" hasta que se cobra
        calc.items.filter(i => i.giftcard).forEach(i => {
          let codigo; do { codigo = codigoGiftcard(GC.prefijo); } while (db.giftcards.some(g => g.codigo === codigo));
          db.giftcards.push({ id: uid('g-'), codigo, pedidoId: p.id, pedidoCodigo: p.codigo, monto: i.precio, saldo: i.precio, ...i.giftcard, comprador: data.cliente?.nombre || '',
            estado: 'pendiente', creado: p.creado, activada: null, vence: null, canjes: [] });
        });
        return p;
      });
    },
    // cupo por franja (pedidos.encargo.cupoFranja): cuántos pedidos activos hay en cada día|franja
    async getOcupacionFranjas() { return ocupacionFranjas(leer().pedidos); },
    // vuelve a poner el stock de la noche (stockBase) en todos los productos que lo tienen
    async cargarStock() { return mut(db => { db.productos.forEach(p => { if (p.stockBase != null && p.stockBase !== '') p.stock = Number(p.stockBase); }); }); },
    async getPedidos() { return leer().pedidos.slice().sort((a, b) => b.creado.localeCompare(a.creado)); },
    async updatePedido(id, patch) {
      return mut(db => {
        const p = db.pedidos.find(x => x.id === id);
        // cancelado: devuelve el stock que había descontado
        if (p && p.stockDescontado && String(patch.estado || '').startsWith('cancel') && !String(p.estado || '').startsWith('cancel')) {
          cantidadesPorProducto(p.items).forEach((n, pid) => { const x = db.productos.find(q => q.id === pid); if (x && x.stock != null && x.stock !== '') x.stock = Number(x.stock) + n; });
          p.stockDescontado = false;
        }
        if (p) Object.assign(p, patch);
        if (p && ['aprobado', 'cobrado'].includes(patch.pagoEstado)) activar(db, id);
        return p;
      });
    },
    async getPedidoPublico(id) { const p = leer().pedidos.find(x => x.id === id); return p ? { id: p.id, codigo: p.codigo, estado: p.estado, pagoEstado: p.pagoEstado, total: p.total, aPagar: p.aPagar, saldo: p.saldo, retiro: p.retiro || null, items: (p.items || []).map(i => ({ nombre: i.nombre, cant: i.cant, detalle: i.detalle || '' })), cliente: { nombre: p.cliente?.nombre || '' } } : null; },
    // Solo demo: lo usa el retorno de Mercado Pago (en producción lo actualiza el webhook).
    async marcarPago(id, pagoEstado, pagoId = '') { return this.updatePedido(id, { pagoEstado, pagoId }); },

    // ---- gift cards
    async getGiftcards() { return (leer().giftcards || []).slice().sort((a, b) => b.creado.localeCompare(a.creado)).map(conEstado); },
    async getGiftcard(codigo) { const c = normalizarCodigo(codigo); return conEstado((leer().giftcards || []).find(g => g.codigo === c)) || null; },
    // Público: lo que ve el comprador al volver del pago (solo las ya activas).
    async getGiftcardsDePedido(pedidoId) {
      return (leer().giftcards || []).filter(g => g.pedidoId === pedidoId && g.estado !== 'pendiente')
        .map(g => ({ codigo: g.codigo, monto: g.monto, saldo: g.saldo, para: g.para, de: g.de, mensaje: g.mensaje, vence: g.vence, estado: estadoGiftcard(g) }));
    },
    async canjearGiftcard(codigo, monto, nota = '') {
      return mut(db => {
        const g = db.giftcards.find(x => x.codigo === normalizarCodigo(codigo));
        if (!g) throw Object.assign(new Error('gc_no_existe'), { code: 'gc_no_existe' });
        if (!canjeable(g)) throw Object.assign(new Error('gc_no_canjeable'), { code: 'gc_no_canjeable' });
        const n = Math.round(Number(monto) * 100) / 100;
        if (!(n > 0) || n > g.saldo) throw Object.assign(new Error('gc_monto'), { code: 'gc_monto' });
        g.saldo = Math.round((g.saldo - n) * 100) / 100;
        g.canjes = [...(g.canjes || []), { monto: n, nota: String(nota || '').slice(0, 120), fecha: new Date().toISOString() }];
        g.estado = g.saldo <= 0 ? 'usada' : 'parcial';
        return conEstado(g);
      });
    },
    // Cobrada en el local (pedido por WhatsApp): la activa a mano.
    async activarGiftcard(codigo) {
      return mut(db => {
        const g = db.giftcards.find(x => x.codigo === normalizarCodigo(codigo));
        if (!g || g.estado !== 'pendiente') return conEstado(g);
        const p = db.pedidos.find(x => x.id === g.pedidoId); if (p && !['aprobado', 'cobrado'].includes(p.pagoEstado)) p.pagoEstado = 'cobrado';
        activar(db, g.pedidoId); return conEstado(g);
      });
    },

    // ---- sesión del panel (en demo no hay contraseña)
    async getSession() { return sessionStorage.getItem(KEY + ':admin') ? { user: { email: 'demo' } } : null; },
    async login() { sessionStorage.setItem(KEY + ':admin', '1'); return { user: { email: 'demo' } }; },
    async logout() { sessionStorage.removeItem(KEY + ':admin'); },

    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
    async reset() { localStorage.removeItem(KEY); localStorage.removeItem(`kit:${config.id}:carrito`); escribir(semilla()); },
  };
}


export function achicarImagen(file, max = 900, q = .82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(Object.assign(new Error('tipo'), { code: 'tipo' }));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      let out = cv.toDataURL('image/webp', q);
      if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/jpeg', q);
      if (out.length > 600_000) out = cv.toDataURL('image/jpeg', .6);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });
}
