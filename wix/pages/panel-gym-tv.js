// Panel GYM · código de página · sección #seccTV · v0.1.54
// Pegar este bloque en el código de la página del Panel GYM.
// Si la página ya tiene $w.onReady, NO dupliques: llama initPanelTv() dentro del existente.
//
// Puente entre el componente HTML #htmlTV (interfaz) y backend/gymTv.web.js.
// Mensajes del HTML: { origen: 'gymTvPanel', id, accion, payload }
// Respuestas al HTML: { origen: 'gymTvVelo', id, ok, data | error }

import {
  gymTvEstado,
  gymTvGuardarVideo,
  gymTvEliminarVideo,
  gymTvCambiarActivo,
  gymTvMoverVideo,
  gymTvAlAire,
  gymTvReiniciar
} from 'backend/gymTv.web';

$w.onReady(() => {
  initPanelTv();
});

function initPanelTv() {
  const html = $w('#htmlTV');
  if (!html) return;

  const acciones = {
    estado: () => gymTvEstado(),
    guardarVideo: (p) => gymTvGuardarVideo(p),
    eliminarVideo: (p) => gymTvEliminarVideo(p.id),
    cambiarActivo: (p) => gymTvCambiarActivo(p.id, p.activo),
    moverVideo: (p) => gymTvMoverVideo(p.id, p.direccion),
    alAire: (p) => gymTvAlAire(p.alAire),
    reiniciar: () => gymTvReiniciar()
  };

  html.onMessage(async (event) => {
    const msg = event.data || {};
    if (msg.origen !== 'gymTvPanel') return;
    const fn = acciones[msg.accion];
    if (!fn) return;
    try {
      const data = await fn(msg.payload || {});
      html.postMessage({ origen: 'gymTvVelo', id: msg.id, ok: true, data });
    } catch (error) {
      console.error('[Panel GYM · TV]', msg.accion, error);
      html.postMessage({ origen: 'gymTvVelo', id: msg.id, ok: false, error: String(error?.message || error) });
    }
  });
}
