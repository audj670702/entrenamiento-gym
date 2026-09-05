from pathlib import Path

path = Path("index.html")
text = path.read_text(encoding="utf-8")

old = '''    const APP_SOUNDS = {
      click: new Audio("./assets/clic.mp3"),
      error: new Audio("./assets/error.mp3"),
      success: new Audio("./assets/exito.mp3"),
      messageSent: new Audio("./assets/mensaje-enviado.mp3"),
      messagePending: new Audio("./assets/mensaje-pendiente.mp3")
    };

    Object.values(APP_SOUNDS).forEach((audio) => {
      audio.preload = "auto";
    });

    let pendingMessageAnnouncement = false;
    let messageAnnouncementPlayed = false;

    async function playAppSound(name) {
      const audio = APP_SOUNDS[name];
      if (!audio) return false;
      try {
        audio.pause();
        audio.currentTime = 0;
        await audio.play();
        return true;
      } catch (error) {
        return false;
      }
    }
'''

new = '''    const APP_SOUNDS = {
      click: "./assets/clic.mp3",
      error: "./assets/error.mp3",
      success: "./assets/exito.mp3",
      messageSent: "./assets/mensaje-enviado.mp3",
      messagePending: "./assets/mensaje-pendiente.mp3"
    };

    let appAudioContext = null;
    const appSoundBuffers = new Map();
    const appSoundBufferPromises = new Map();

    function getAppAudioContext() {
      if (appAudioContext) return appAudioContext;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;

      try {
        appAudioContext = new AudioContextClass();
        return appAudioContext;
      } catch (error) {
        return null;
      }
    }

    async function loadAppSoundBuffer(name) {
      if (appSoundBuffers.has(name)) return appSoundBuffers.get(name);
      if (appSoundBufferPromises.has(name)) return appSoundBufferPromises.get(name);

      const url = APP_SOUNDS[name];
      const context = getAppAudioContext();
      if (!url || !context) return null;

      const promise = fetch(url, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error("No fue posible cargar el audio.");
          return response.arrayBuffer();
        })
        .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
        .then((buffer) => {
          appSoundBuffers.set(name, buffer);
          appSoundBufferPromises.delete(name);
          return buffer;
        })
        .catch(() => {
          appSoundBufferPromises.delete(name);
          return null;
        });

      appSoundBufferPromises.set(name, promise);
      return promise;
    }

    let pendingMessageAnnouncement = false;
    let messageAnnouncementPlayed = false;

    async function playAppSound(name) {
      if (!APP_SOUNDS[name]) return false;

      try {
        const context = getAppAudioContext();
        if (!context) return false;

        if (context.state === "suspended") {
          await context.resume();
        }

        const buffer = await loadAppSoundBuffer(name);
        if (!buffer) return false;

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);
        return true;
      } catch (error) {
        return false;
      }
    }
'''

if text.count(old) != 1:
    raise SystemExit(f"Expected exactly one legacy audio block; found {text.count(old)}")

updated = text.replace(old, new, 1)

for required in [
    'playAppSound("click")',
    'playAppSound("messageSent")',
    'playAppSound("messagePending")',
    'playAppSound("success")',
    'playAppSound("error")',
]:
    if required not in updated:
        raise SystemExit(f"Required existing call missing after migration: {required}")

if 'new Audio("./assets/' in updated:
    raise SystemExit("Legacy APP_SOUNDS Audio elements remain")

path.write_text(updated, encoding="utf-8")
