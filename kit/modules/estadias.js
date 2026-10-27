// Módulo ESTADÍAS (alojamientos): calendario de llegada/salida → habitación → datos → seña con Mercado Pago o consulta por WhatsApp.
// Entra al panel como "pendiente"; el dueño la confirma. Las noches ocupadas salen del panel.
//
// <div data-kit="estadias"></div>                          formulario en la página
// <button data-kit-open="estadias" data-kit-hab="deluxe">  popup con esa habitación elegida
// kit.estadias.abrir({ habitacion, llegada, salida })     idem por JS
import { esc, h, $$, telValido } from '../core/util.js';
import { t } from '../core/i18n.js';
import { popup, toast } from '../core/ui.js';
import { diaNum, fechaDeNum, diaSemana } from '../core/turnos.js';
import { configEstadias, cotizar, nochesEntre, horasLlegada } from '../core/estadias.js';
import { linkWhatsApp } from '../core/pedidos.js';

const ICO_FLECHA = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;

export function initEstadias(ctx, opts = {}) {
  const { config, store } = ctx;
  const E = configEstadias(config);
  let ocupacion = [];   // [{ habitacion, llegada, salida }]
  let tarifas = E.tarifas;
  const forms = new Set();

  async function cargar() {
    try { [ocupacion, tarifas] = await Promise.all([store.getOcupacionEstadias(), store.getTarifas()]); } catch (e) { console.error('[kit] estadías', e); }
    forms.forEach(f => (f.isConnected && f.querySelector('[data-meses]')) ? f._pintar() : forms.delete(f));
  }
  const cargado = cargar();
  store.onChange(cargar);

  const hoy = () => ctx.hoy();
  const occDe = (habId) => { const s = new Set(); ocupacion.filter(o => o.habitacion === habId).forEach(o => nochesEntre(o.llegada, o.salida).forEach(f => s.add(f))); return s; };
  const libreHab = (habId, a, b) => { const s = occDe(habId); return nochesEntre(a, b).every(f => !s.has(f)); };
  const hab = (id) => E.habitaciones.find(x => x.id === id);
  const fCorta = (f) => { if (!f) return '—'; const [, m, d] = f.split('-').map(Number); return `${t('diasCortos')[diaSemana(f)]} ${d} ${t('meses')[m - 1]}`; };

  function crearForm({ inicial = {}, enPopup = false, onDone } = {}) {
    const st = {
      habitacion: hab(inicial.habitacion) ? inicial.habitacion : (E.habitaciones.length === 1 ? E.habitaciones[0].id : null),
      llegada: inicial.llegada || null, salida: inicial.salida || null, huespedes: 2,
      nombre: '', telefono: '', email: '', horaLlegada: '', comentario: '',
      mes: null, hover: null,
    };
    const base = hoy();
    st.mes = (st.llegada || base).slice(0, 7);
    // si quedan pocos días del mes, arranca en el siguiente (el calendario no abre casi vacío)
    if (!st.llegada) { const [y, m, d] = base.split('-').map(Number); const finMes = new Date(Date.UTC(y, m, 0)).getUTCDate(); if (finMes - d < 7) st.mes = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); }
    const horas = horasLlegada(E);
    const maxMes = fechaDeNum(diaNum(base) + E.diasAdelante).slice(0, 7);

    const el = h(`<form class="kit-root kit-est${enPopup ? ' kit-est--pop' : ''}" novalidate><div class="kit-est__in">
      <div class="kit-est__cal">
        <div class="kit-est__nav">
          <button type="button" class="kit-est__flecha" data-mes="-1" aria-label="${esc(t('mesAnterior'))}">${ICO_FLECHA('l')}</button>
          <div class="kit-est__titulos" data-titulos aria-live="polite"></div>
          <button type="button" class="kit-est__flecha" data-mes="1" aria-label="${esc(t('mesSiguiente'))}">${ICO_FLECHA('r')}</button>
        </div>
        <div class="kit-est__meses" data-meses></div>
        <div class="kit-est__ley"><span><i class="kit-est__dot kit-est__dot--sel"></i>${esc(t('estLlegadaSalida'))}</span><span><i class="kit-est__dot kit-est__dot--occ"></i>${esc(t('estOcupado'))}</span>
          <span>${esc(t('estHorarios', { desde: E.checkin[0], hasta: E.checkin[1], salida: E.checkout }))}</span></div>
      </div>
      <div class="kit-est__side">
        <fieldset class="kit-est__habs"><legend class="kit-label">${esc(t('estHabitacion'))}</legend><div data-habs></div></fieldset>
        <div class="kit-est__res" data-resumen aria-live="polite"></div>
        <div class="kit-est__datos">
          <label class="kit-field"><span>${esc(t('nombre'))}</span><input name="nombre" autocomplete="name" required></label>
          <label class="kit-field"><span>${esc(t('telefono'))}</span><input name="telefono" type="tel" inputmode="tel" autocomplete="tel" required></label>
          <label class="kit-field"><span>${esc(t('email'))}</span><input name="email" type="email" autocomplete="email"></label>
          <label class="kit-field"><span>${esc(t('estHoraLlegada'))}</span><select name="horaLlegada"><option value="">${esc(t('estElegiHora'))}</option>${horas.map(x => `<option>${x}</option>`).join('')}</select></label>
          <div class="kit-field kit-est__hues"><span id="ke-h">${esc(t('estHuespedes'))}</span>
            <div class="kit-step" role="group" aria-labelledby="ke-h"><button type="button" data-hues="-1" aria-label="−">−</button><output data-hues-n>2</output><button type="button" data-hues="1" aria-label="+">+</button></div></div>
          <label class="kit-field kit-field--full"><span>${esc(t('comentario'))}</span><textarea name="comentario" rows="2" maxlength="400"></textarea></label>
        </div>
        <p class="kit-msg" role="alert" hidden></p>
        <div class="kit-est__acciones">
          ${config.pagos?.mercadopago ? `<button type="submit" name="pago" value="mercadopago" class="kit-btn kit-btn--big" data-mp>${esc(t('estSenar'))}</button>` : ''}
          <button type="submit" name="pago" value="whatsapp" class="kit-btn kit-btn--big kit-btn--ghost">${esc(t('estConsultarWA'))}</button>
        </div>
      </div>
    </div></form>`);

    const maxH = () => (hab(st.habitacion)?.capacidad) || Math.max(2, ...E.habitaciones.map(x => x.capacidad || 2));
    // noche ocupada: con habitación elegida, la suya; si no, cuando no queda ninguna libre
    const occ = () => {
      if (st.habitacion) return occDe(st.habitacion);
      const sets = E.habitaciones.map(x => occDe(x.id)); const s = new Set();
      if (!sets.length) return s;
      sets[0].forEach(f => { if (sets.every(x => x.has(f))) s.add(f); });
      return s;
    };
    const rangoLibre = (a, b) => st.habitacion ? libreHab(st.habitacion, a, b) : E.habitaciones.some(x => libreHab(x.id, a, b));

    function mesHTML(ym, ocupadas) {
      const [y, m] = ym.split('-').map(Number);
      const primero = `${ym}-01`; const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const off = (diaSemana(primero) + 6) % 7;
      const hoyN = diaNum(base), limN = diaNum(base) + E.diasAdelante;
      const fin = st.salida || (st.llegada && st.hover && st.hover > st.llegada ? st.hover : null);
      let celdas = '';
      for (let i = 0; i < off; i++) celdas += '<span></span>';
      for (let d = 1; d <= dias; d++) {
        const f = `${ym}-${String(d).padStart(2, '0')}`; const n = diaNum(f);
        const fuera = n < hoyN || n > limN; const o = ocupadas.has(f);
        const cls = ['kit-est__d'];
        if (n === hoyN) cls.push('is-hoy'); if (o) cls.push('is-occ');
        if (f === st.llegada) { cls.push('is-ini'); if (!fin) cls.push('is-solo'); } if (f === fin) cls.push('is-fin');
        if (st.llegada && fin && f > st.llegada && f < fin) cls.push('is-in');
        if (!st.salida && st.hover && fin === st.hover) cls.push('is-prev');
        // el día de salida puede ser una noche ocupada (te vas a la mañana)
        const elegible = !fuera && (!o || (st.llegada && !st.salida && f > st.llegada));
        celdas += `<button type="button" class="${cls.join(' ')}" data-f="${f}" ${elegible ? '' : 'disabled'} aria-pressed="${f === st.llegada || f === st.salida}" aria-label="${esc(fCorta(f))}${o ? ` · ${esc(t('estOcupado'))}` : ''}">${d}</button>`;
      }
      return `<div class="kit-est__mes"><div class="kit-est__mes-t">${esc(t('mesesLargos')[m - 1])} ${y}</div>
        <div class="kit-est__sem">${t('diasCortos').slice(1).concat(t('diasCortos')[0]).map(x => `<span>${esc(x.slice(0, 2))}</span>`).join('')}</div>
        <div class="kit-est__grid">${celdas}</div></div>`;
    }
    const sumarMes = (ym, k) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7); };

    function pintarCal() {
      const o = occ(); const meses = [st.mes, sumarMes(st.mes, 1)];
      el.querySelector('[data-meses]').innerHTML = meses.map(ym => mesHTML(ym, o)).join('');
      el.querySelector('[data-titulos]').innerHTML = meses.map((ym, i) => { const [y, m] = ym.split('-').map(Number); return `<span class="kit-est__tit${i ? ' kit-est__tit--2' : ''}">${esc(t('mesesLargos')[m - 1])} ${y}</span>`; }).join('');
      el.querySelector('[data-mes="-1"]').disabled = st.mes <= base.slice(0, 7);
      el.querySelector('[data-mes="1"]').disabled = st.mes >= maxMes;
    }

    function pintarHabs() {
      const conFechas = st.llegada && st.salida;
      el.querySelector('[data-habs]').innerHTML = E.habitaciones.map(x => {
        const libre = !conFechas || libreHab(x.id, st.llegada, st.salida);
        const q = conFechas ? cotizar(E, tarifas, x.id, st.llegada, st.salida) : null;
        const desde = q?.total != null ? `${ctx.money(q.total)} · ${q.noches} ${t(q.noches === 1 ? 'estNoche' : 'estNoches')}` : (!conFechas && tarifas.base?.[x.id] != null ? t('estDesdeNoche', { precio: ctx.money(Number(tarifas.base[x.id])) }) : '');
        return `<label class="kit-est__hab${st.habitacion === x.id ? ' is-on' : ''}${libre ? '' : ' is-off'}">
          <input type="radio" name="habitacion" value="${esc(x.id)}" ${st.habitacion === x.id ? 'checked' : ''} ${libre ? '' : 'disabled'}>
          ${x.foto ? `<img src="${esc(ctx.asset(x.foto))}" alt="" loading="lazy" decoding="async" width="96" height="72">` : ''}
          <span class="kit-est__hab-tx"><b>${esc(x.nombre)}</b><small>${esc(x.descripcion || '')}</small>
          <em>${libre ? esc(desde || ' ') : esc(t('estNoLibre'))}</em></span></label>`;
      }).join('');
    }

    function pintarResumen() {
      const q = st.habitacion && st.llegada && st.salida ? cotizar(E, tarifas, st.habitacion, st.llegada, st.salida) : null;
      const prom = q?.total != null && q.noches ? Math.round(q.total / q.noches) : null;
      el.querySelector('[data-resumen]').innerHTML = `
        <div><span>${esc(t('estLlegada'))}</span><b>${esc(fCorta(st.llegada))}</b></div>
        <div><span>${esc(t('estSalida'))}</span><b>${esc(fCorta(st.salida))}</b></div>
        <div><span>${q ? esc(`${q.noches} × ${prom != null ? ctx.money(prom) : t('sinPrecio')}`) : esc(t('estNochesLbl'))}</span><b>${q ? (q.total != null ? ctx.money(q.total) : esc(t('sinPrecio'))) : '—'}</b></div>
        <div class="kit-est__sena"><span>${esc(t('estSenaLbl', { pct: q?.pct ?? (tarifas.sena ?? E.sena) }))}</span><b>${q?.sena != null ? ctx.money(q.sena) : '—'}</b></div>
        <p class="kit-est__min" ${q && q.noches < q.minNoches ? '' : 'hidden'}>${esc(t('estMinNoches', { n: q?.minNoches || E.minNoches }))}</p>`;
      const mp = el.querySelector('[data-mp]'); if (mp) mp.disabled = !!q && q.total == null;
      el.querySelector('[data-hues-n]').textContent = st.huespedes;
      el.querySelector('[data-hues="-1"]').disabled = st.huespedes <= 1;
      el.querySelector('[data-hues="1"]').disabled = st.huespedes >= maxH();
    }
    el._pintar = () => { pintarCal(); pintarHabs(); pintarResumen(); };

    function error(msg) { const m = el.querySelector('.kit-msg'); m.textContent = msg; m.hidden = false; m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); }
    const limpiarError = () => { el.querySelector('.kit-msg').hidden = true; };

    el.addEventListener('click', (e) => {
      const mv = e.target.closest('[data-mes]');
      if (mv) { st.mes = sumarMes(st.mes, Number(mv.dataset.mes)); pintarCal(); return; }
      const hu = e.target.closest('[data-hues]');
      if (hu) { st.huespedes = Math.max(1, Math.min(maxH(), st.huespedes + Number(hu.dataset.hues))); pintarResumen(); return; }
      const d = e.target.closest('[data-f]'); if (!d) return;
      const f = d.dataset.f; limpiarError();
      if (!st.llegada || st.salida || f <= st.llegada) { st.llegada = f; st.salida = null; }
      else if (rangoLibre(st.llegada, f)) {
        if (nochesEntre(st.llegada, f).length > E.maxNoches) { error(t('estMaxNoches', { n: E.maxNoches })); return; }
        st.salida = f;
        if (st.habitacion && !libreHab(st.habitacion, st.llegada, st.salida)) st.habitacion = null;
        if (!st.habitacion) { const libres = E.habitaciones.filter(x => libreHab(x.id, st.llegada, st.salida)); if (libres.length === 1) st.habitacion = libres[0].id; }
      } else { error(t('estRangoOcupado')); st.llegada = occ().has(f) ? null : f; st.salida = null; }
      st.hover = null;
      el._pintar();
      document.dispatchEvent(new CustomEvent('kit:estadia-fechas', { detail: { llegada: st.llegada, salida: st.salida, habitacion: st.habitacion } }));
    });
    // vista previa del rango con el mouse
    el.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || !st.llegada || st.salida) return;
      const d = e.target.closest('[data-f]'); const f = d && !d.disabled ? d.dataset.f : null;
      if (f === st.hover) return; st.hover = f; requestAnimationFrame(pintarCal);
    });
    el.addEventListener('change', (e) => {
      if (e.target.name === 'habitacion') {
        st.habitacion = e.target.value; limpiarError();
        st.huespedes = Math.min(st.huespedes, maxH());
        if (st.llegada && st.salida && !libreHab(st.habitacion, st.llegada, st.salida)) { st.salida = null; error(t('estRangoOcupado')); }
        el._pintar();
      }
    });
    el.addEventListener('input', (e) => { const f = e.target; if (['nombre', 'telefono', 'email', 'horaLlegada', 'comentario'].includes(f.name)) st[f.name] = f.value; });

    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pago = e.submitter?.value || 'whatsapp';
      const faltan = [];
      if (!st.llegada || !st.salida) faltan.push(t('estFechas').toLowerCase());
      if (!st.habitacion) faltan.push(t('estHabitacion').toLowerCase());
      if (!st.nombre.trim()) faltan.push(t('nombre').toLowerCase());
      if (!telValido(st.telefono)) faltan.push(t('telefono').toLowerCase());
      if (!st.horaLlegada) faltan.push(t('estHoraLlegada').toLowerCase());
      if (faltan.length) return error(t('faltan', { campos: faltan.join(', ') }));
      const q = cotizar(E, tarifas, st.habitacion, st.llegada, st.salida);
      if (q.noches < q.minNoches) return error(t('estMinNoches', { n: q.minNoches }));
      const btns = $$('[type=submit]', el); btns.forEach(b => { b.disabled = true; }); e.submitter?.classList.add('is-loading');
      try {
        const est = await store.createEstadia({ habitacion: st.habitacion, llegada: st.llegada, salida: st.salida, huespedes: st.huespedes, nombre: st.nombre.trim(), telefono: st.telefono.trim(),
          email: st.email.trim(), horaLlegada: st.horaLlegada, comentario: st.comentario.trim(), pago, total: q.total, sena: q.sena, origen: 'web' });
        document.dispatchEvent(new CustomEvent('kit:estadia', { detail: est }));
        const resumen = resumenDe(est);
        if (pago === 'mercadopago' && est.sena) { await pagarMP(est, resumen); return; }
        const { url } = linkWhatsApp(config.whatsapp, mensajeWA(resumen));
        if (url) window.open(url, '_blank', 'noopener');
        listo(est, resumen, 'whatsapp', el);
        onDone && onDone(est);
      } catch (err) {
        btns.forEach(b => { b.disabled = false; b.classList.remove('is-loading'); });
        if (err.code === 'sin_lugar' || /sin_lugar/.test(err.message)) { error(t('estRangoOcupado')); cargar(); }
        else { console.error('[kit] estadía', err); error(t('error')); }
      }
    });

    el._pintar(); forms.add(el);
    return el;
  }

  function resumenDe(e) {
    return { codigo: e.codigo, habitacion: hab(e.habitacion)?.nombre || e.habitacion, llegada: fCorta(e.llegada), salida: fCorta(e.salida), noches: e.noches,
      huespedes: e.huespedes, hora: e.horaLlegada, nombre: e.nombre, total: e.total != null ? ctx.money(e.total) : t('sinPrecio'), sena: e.sena != null ? ctx.money(e.sena) : '', negocio: config.nombre };
  }
  const mensajeWA = (r) => t('estWA', r) + (r.hora ? `\n${t('estWAHora', r)}` : '');

  // La demo puede dibujar su propia confirmación: escucha kit:estadia-lista y hace preventDefault()
  function listo(estadia, resumen, pago, el) {
    const ev = new CustomEvent('kit:estadia-lista', { detail: { estadia, resumen, pago, el }, cancelable: true });
    if (!document.dispatchEvent(ev)) return;
    const { url } = linkWhatsApp(config.whatsapp, mensajeWA(resumen));
    const html = `<div class="kit-done">
      <div class="kit-done__ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h3>${esc(t(pago === 'mercadopago' ? 'estSenaPagada' : 'estPedida'))}</h3><p>${esc(t(pago === 'mercadopago' ? 'estSenaPagadaSub' : 'estPedidaSub', resumen))}</p>
      ${url ? `<div class="kit-row kit-row--center"><a class="kit-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(t('avisarWA'))}</a></div>` : ''}</div>`;
    if (el) { el.innerHTML = html; return; }
    popup({ titulo: t('estPedida'), contenido: html, clase: 'kit-pop--sm' });
  }

  // ---------- Mercado Pago (seña)
  function urlRetorno(e) {
    const u = new URL(location.href); u.hash = '';
    [...u.searchParams.keys()].forEach(k => { if (k === 'kit_estadia' || /^(collection_|payment_|merchant_|preference_id|external_reference|status|site_id|processing_mode)/.test(k)) u.searchParams.delete(k); });
    u.searchParams.set('kit_estadia', e.id); return u.href;
  }
  async function pagarMP(est, resumen) {
    const mp = config.pagos.mercadopago;
    if (mp.modo === 'simulado' || !mp.endpoint) return simularMP(est, resumen);
    try {
      const res = await fetch(mp.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negocio: config.id, pais: config.pais, modo: mp.modo || 'sandbox', pedidoId: est.id, codigo: est.codigo,
          items: [{ title: `${t('estSenaCorta')} · ${resumen.habitacion} · ${resumen.llegada} → ${resumen.salida}`, quantity: 1, unit_price: est.sena }],
          backUrl: urlRetorno(est), payer: { name: est.nombre } }) });
      const j = await res.json().catch(() => ({}));
      const destino = (mp.modo !== 'produccion' && j.sandbox_init_point) || j.init_point;
      if (!res.ok || !destino) throw new Error(j.error || 'sin init_point');
      location.href = destino;
    } catch (err) {
      console.warn('[kit] Mercado Pago:', err.message); toast(t('mpSinConexion'), 'warn', 4200); simularMP(est, resumen);
    }
  }
  function simularMP(est, resumen) {
    document.querySelectorAll('.kit-pop').forEach(p => p.querySelector('[data-close]')?.click());
    const box = h(`<div class="kit-sim"><p class="kit-sim__tag">DEMO</p><p>${esc(t('mpSimuladoSub'))}</p>
      <div class="kit-sim__total"><span>${esc(est.codigo)} · ${esc(t('estSenaCorta'))}</span><b>${ctx.money(est.sena)}</b></div>
      <div class="kit-row kit-row--stack"><button type="button" class="kit-btn kit-btn--block" data-ok>${esc(t('mpAprobar'))}</button>
      <button type="button" class="kit-btn kit-btn--ghost kit-btn--block" data-no>${esc(t('mpRechazar'))}</button></div></div>`);
    const p = popup({ titulo: t('mpSimulado'), contenido: box, clase: 'kit-pop--sm' });
    box.querySelector('[data-ok]').onclick = () => { p.close(); retorno(est.id, 'approved', 'SIM-' + Date.now()); };
    box.querySelector('[data-no]').onclick = () => { p.close(); retorno(est.id, 'rejected'); };
  }
  async function retorno(id, status, pagoId = '') {
    const estado = status === 'approved' ? 'aprobado' : (/rejected|null|failure/.test(status)) ? 'rechazado' : 'pendiente';
    try { await store.updateEstadia(id, { pagoEstado: estado, pagoId }); } catch (_) { /* en producción lo actualiza el webhook */ }
    const e = await store.getEstadiaPublica(id);
    if (estado === 'aprobado' && e) listo(e, resumenDe(e), 'mercadopago');
    else if (estado === 'pendiente') toast(t('pagoPendiente'), 'warn', 4200);
    else toast(t('pagoRechazadoSub'), 'warn', 4200);
  }
  const q = new URLSearchParams(location.search);
  if (q.get('kit_estadia')) {
    const id = q.get('kit_estadia'); const status = q.get('collection_status') || q.get('status') || 'pending';
    const u = new URL(location.href); [...u.searchParams.keys()].forEach(k => { if (k === 'kit_estadia' || /^(collection_|payment_|merchant_|preference_id|external_reference|status|site_id|processing_mode)/.test(k)) u.searchParams.delete(k); });
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    retorno(id, status, q.get('payment_id') || q.get('collection_id') || '');
  }

  // montar
  document.querySelectorAll('[data-kit="estadias"]').forEach(box => { box.innerHTML = ''; box.appendChild(crearForm(opts)); });
  const abrir = (inicial = {}) => popup({ titulo: t('estTitulo'), contenido: crearForm({ inicial, enPopup: true }), tipo: 'modal', clase: 'kit-pop--est' });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kit-open="estadias"]'); if (!b) return;
    e.preventDefault(); abrir({ habitacion: b.dataset.kitHab, llegada: b.dataset.kitLlegada, salida: b.dataset.kitSalida });
  });

  return {
    abrir, crearForm, habitaciones: E.habitaciones, config: E,
    listo: cargado,
    ocupadas: (habId) => occDe(habId),
    cotizar: (habId, a, b) => cotizar(E, tarifas, habId, a, b),
    recargar: cargar,
  };
}
