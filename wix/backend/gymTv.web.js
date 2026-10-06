// backend/gymTv.web.js · Canal GYM · v0.1.54
// Métodos que usa el Panel GYM (sección #seccTV, componente #htmlTV).
// Permiso: sólo administradores del sitio. Si el Panel GYM lo operan miembros con un
// rol propio, cambiar Permissions.Admin por Permissions.SiteMember y validar el rol aquí.

import { Permissions, webMethod } from 'wix-web-module';
import {
  estadoPanel,
  guardarVideo,
  eliminarVideo,
  cambiarActivo,
  moverVideo,
  ponerAlAire,
  reiniciarEmision
} from 'backend/gymTvCore';

export const gymTvEstado = webMethod(Permissions.Admin, async () => estadoPanel());

export const gymTvGuardarVideo = webMethod(Permissions.Admin, async (datos) => {
  await guardarVideo(datos);
  return estadoPanel();
});

export const gymTvEliminarVideo = webMethod(Permissions.Admin, async (id) => {
  await eliminarVideo(id);
  return estadoPanel();
});

export const gymTvCambiarActivo = webMethod(Permissions.Admin, async (id, activo) => {
  await cambiarActivo(id, activo);
  return estadoPanel();
});

export const gymTvMoverVideo = webMethod(Permissions.Admin, async (id, direccion) => {
  await moverVideo(id, direccion);
  return estadoPanel();
});

export const gymTvAlAire = webMethod(Permissions.Admin, async (alAire) => {
  await ponerAlAire(alAire);
  return estadoPanel();
});

export const gymTvReiniciar = webMethod(Permissions.Admin, async () => {
  await reiniciarEmision();
  return estadoPanel();
});
