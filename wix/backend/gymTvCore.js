// backend/gymTvCore.js · Canal GYM · v0.1.54
// Lógica compartida del canal de TV de GYM. La usan:
//   - backend/gymTv.web.js      → Panel GYM (#seccTV / #htmlTV)
//   - backend/http-functions.js → gymPwaContext (campo `tv` del monitor de la app)
//
// Mismo modelo que CPC / NEXUS: un registro en TV_SCaD_Canal y la programación en
// TV_SCaD_Parrilla, filtrados por app + enteOperador. GYM todavía no está en el modelo
// SYS (no tiene EO en SCaD_EO), así que el canal se identifica con app = "GYM" y
// enteOperador = "GYM". Cuando GYM tenga EO, basta con cambiar GYM_TV_EO.
//
// Emisión: con el canal al aire, la parrilla (videos activos, por `orden`) se reproduce
// en ciclo desde `inicioEmision`. Todos los usuarios ven el mismo video en el mismo segundo.

import wixData from 'wix-data';

export const GYM_TV_APP = 'GYM';
export const GYM_TV_EO = 'GYM';
export const COL_CANAL = 'TV_SCaD_Canal';
export const COL_PARRILLA = 'TV_SCaD_Parrilla';

const OPT = { suppressAuth: true };

// ---------- utilidades ----------
export function extraerYoutubeId(valor) {
  const raw = String(valor || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

function miniatura(youtubeId) {
  return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : '';
}

function duracionValida(item) {
  return Math.max(0, Math.floor(Number(item?.duracionSegundos) || 0));
}

// ---------- lecturas ----------
export async function obtenerCanal() {
  const r = await wixData.query(COL_CANAL)
    .eq('app', GYM_TV_APP)
    .eq('enteOperador', GYM_TV_EO)
    .limit(1)
    .find(OPT);
  return r.items[0] || null;
}

export async function asegurarCanal() {
  const canal = await obtenerCanal();
  if (canal) return canal;
  return wixData.insert(COL_CANAL, {
    app: GYM_TV_APP,
    enteOperador: GYM_TV_EO,
    alAire: false,
    inicioEmision: null,
    fechaActualizacion: new Date()
  }, OPT);
}

export async function obtenerParrilla({ soloActivos = false } = {}) {
  let q = wixData.query(COL_PARRILLA)
    .eq('app', GYM_TV_APP)
    .eq('enteOperador', GYM_TV_EO);
  if (soloActivos) q = q.eq('activo', true);
  const r = await q.ascending('orden').limit(1000).find(OPT);
  return r.items;
}

// ---------- cálculo de la transmisión (función pura) ----------
// Devuelve lo que el monitor necesita: { modo, youtubeId, segundoInicio, titulo, ... }.
// modo: PARRILLA (al aire con videos) · SIN_PARRILLA (al aire sin videos válidos) · FUERA_DEL_AIRE.
export function calcularTransmision(canal, items, ahora = new Date()) {
  const vacio = { youtubeId: '', segundoInicio: 0, titulo: '' };
  if (!canal || canal.alAire !== true) return { modo: 'FUERA_DEL_AIRE', ...vacio };

  const lista = (items || [])
    .filter(i => i && i.activo === true && extraerYoutubeId(i.youtubeId) && duracionValida(i) > 0)
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  if (!lista.length) return { modo: 'SIN_PARRILLA', ...vacio };

  const total = lista.reduce((s, i) => s + duracionValida(i), 0);
  const inicio = canal.inicioEmision ? new Date(canal.inicioEmision) : ahora;
  let t = Math.floor((ahora.getTime() - inicio.getTime()) / 1000);
  if (!Number.isFinite(t) || t < 0) t = 0;
  t = t % total;

  for (let n = 0; n < lista.length; n++) {
    const item = lista[n];
    const d = duracionValida(item);
    if (t < d) {
      return {
        modo: 'PARRILLA',
        youtubeId: extraerYoutubeId(item.youtubeId),
        segundoInicio: t,
        titulo: item.titulo || '',
        videoId: item._id,
        posicion: n + 1,
        totalVideos: lista.length,
        duracionSegundos: d,
        restanteSegundos: d - t,
        cicloSegundos: total
      };
    }
    t -= d;
  }
  return { modo: 'SIN_PARRILLA', ...vacio };
}

// Para gymPwaContext: lo que recibe el monitor de la app (gym-tv.js).
export async function obtenerTvGym() {
  const [canal, items] = await Promise.all([obtenerCanal(), obtenerParrilla({ soloActivos: true })]);
  const tv = calcularTransmision(canal, items);
  return {
    modo: tv.modo,
    youtubeId: tv.youtubeId,
    segundoInicio: tv.segundoInicio,
    titulo: tv.titulo
  };
}

// ---------- escrituras (sólo desde el Panel GYM) ----------
async function obtenerVideoGym(id) {
  const item = await wixData.get(COL_PARRILLA, String(id || ''), OPT);
  if (!item || item.app !== GYM_TV_APP || item.enteOperador !== GYM_TV_EO) {
    throw new Error('El video no pertenece al Canal GYM.');
  }
  return item;
}

export async function guardarVideo(datos = {}) {
  const youtubeId = extraerYoutubeId(datos.youtubeId || datos.youtubeUrl);
  if (!youtubeId) throw new Error('URL o ID de YouTube no válido.');
  const duracionSegundos = Math.floor(Number(datos.duracionSegundos) || 0);
  if (duracionSegundos <= 0) throw new Error('Indica la duración del video.');

  const ahora = new Date();
  const campos = {
    youtubeId,
    youtubeUrl: String(datos.youtubeUrl || '').trim() || `https://youtu.be/${youtubeId}`,
    titulo: String(datos.titulo || '').trim(),
    miniaturaUrl: miniatura(youtubeId),
    duracionSegundos,
    activo: datos.activo !== false,
    fechaActualizacion: ahora
  };

  if (datos._id) {
    const actual = await obtenerVideoGym(datos._id);
    return wixData.update(COL_PARRILLA, { ...actual, ...campos }, OPT);
  }

  const existentes = await obtenerParrilla();
  const orden = existentes.reduce((m, i) => Math.max(m, Number(i.orden) || 0), 0) + 1;
  return wixData.insert(COL_PARRILLA, {
    ...campos,
    app: GYM_TV_APP,
    enteOperador: GYM_TV_EO,
    orden,
    fechaAlta: ahora
  }, OPT);
}

export async function eliminarVideo(id) {
  await obtenerVideoGym(id);
  await wixData.remove(COL_PARRILLA, String(id), OPT);
  await renumerar();
}

export async function cambiarActivo(id, activo) {
  const actual = await obtenerVideoGym(id);
  return wixData.update(COL_PARRILLA, { ...actual, activo: activo === true, fechaActualizacion: new Date() }, OPT);
}

// direccion: -1 sube, +1 baja
export async function moverVideo(id, direccion) {
  const lista = await obtenerParrilla();
  const i = lista.findIndex(v => v._id === id);
  const j = i + (direccion < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await renumerar(lista);
}

async function renumerar(lista) {
  const items = lista || await obtenerParrilla();
  const ahora = new Date();
  const cambios = items
    .map((v, n) => ({ v, orden: n + 1 }))
    .filter(({ v, orden }) => Number(v.orden) !== orden)
    .map(({ v, orden }) => ({ ...v, orden, fechaActualizacion: ahora }));
  if (cambios.length) await wixData.bulkUpdate(COL_PARRILLA, cambios, OPT);
}

// alAire true: arranca la emisión desde el primer video. false: saca el canal del aire.
export async function ponerAlAire(alAire) {
  const canal = await asegurarCanal();
  const ahora = new Date();
  return wixData.update(COL_CANAL, {
    ...canal,
    alAire: alAire === true,
    inicioEmision: alAire === true ? ahora : canal.inicioEmision,
    fechaActualizacion: ahora
  }, OPT);
}

// Vuelve a empezar la parrilla desde el primer video sin sacar el canal del aire.
export async function reiniciarEmision() {
  const canal = await asegurarCanal();
  const ahora = new Date();
  return wixData.update(COL_CANAL, { ...canal, inicioEmision: ahora, fechaActualizacion: ahora }, OPT);
}

export async function estadoPanel() {
  const [canal, parrilla] = await Promise.all([asegurarCanal(), obtenerParrilla()]);
  const transmision = calcularTransmision(canal, parrilla);
  return {
    canal: {
      alAire: canal.alAire === true,
      inicioEmision: canal.inicioEmision || null,
      fechaActualizacion: canal.fechaActualizacion || null
    },
    parrilla: parrilla.map(v => ({
      _id: v._id,
      orden: v.orden,
      titulo: v.titulo || '',
      youtubeId: v.youtubeId,
      youtubeUrl: v.youtubeUrl,
      miniaturaUrl: v.miniaturaUrl || miniatura(v.youtubeId),
      duracionSegundos: duracionValida(v),
      activo: v.activo === true
    })),
    transmision,
    servidor: new Date().toISOString()
  };
}
