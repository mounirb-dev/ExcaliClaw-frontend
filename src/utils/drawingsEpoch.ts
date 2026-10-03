/** Contador de "han cambiado tus datos": sube con cada escritura real (guardar una
 * escena, crear, mover, renombrar o borrar un dibujo, borrar una carpeta...).
 * Las copias locales (listas del panel, carpetas, escenas) guardan la época con la
 * que se pidieron y solo se reutilizan mientras no haya cambiado: así entrar sin
 * editar no pide nada, y cualquier edición las invalida.
 *
 * Se persiste en localStorage para que valga entre recargas y entre pestañas (una
 * edición en otra pestaña invalida también las copias de esta). */
const EPOCH_KEY = "excaliclaw:writeEpoch";
let memoryEpoch = 0;

const readEpoch = (): number => {
  try {
    const stored = Number(localStorage.getItem(EPOCH_KEY));
    if (Number.isFinite(stored) && stored > memoryEpoch) memoryEpoch = stored;
  } catch {
    // localStorage bloqueado: vale la época en memoria (solo esta pestaña).
  }
  return memoryEpoch;
};

export const getDrawingsEpoch = (): number => readEpoch();

export const bumpDrawingsEpoch = (): void => {
  memoryEpoch = readEpoch() + 1;
  try {
    localStorage.setItem(EPOCH_KEY, String(memoryEpoch));
  } catch {
    // Sin persistencia: la época en memoria sigue subiendo.
  }
};
