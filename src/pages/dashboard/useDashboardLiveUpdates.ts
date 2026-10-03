import { useEffect, useRef } from "react";
import { DATA_CHANGED_EVENT } from "../../utils/userFeed";

// NO MIGRADO: el backend antiguo transmitía un evento de socket global
// "drawings-changed" cada vez que algo invalidaba su caché de lista del
// lado del servidor, que este hook escuchaba para refrescar el dashboard sin
// hacer polling. El backend de Worker/Appwrite no tiene un punto central de
// invalidación equivalente (construirlo sería un Durable Object que rastree
// "la lista de dibujos de este usuario cambió": trabajo real, aún sin
// empezar). Se recurre al proxy más barato: volver a obtener datos cuando
// la pestaña recupera el foco, que cubre el caso común (crear un dibujo vía
// MCP/API en otra sesión y volver a mirar el dashboard).
//
// TOPE DE FRECUENCIA: cada refresco son 2 peticiones al Worker (lista de
// dibujos + colecciones) y se cobra por petición. Los eventos de foco /
// visibilidad pueden dispararse en ráfaga o en bucle (visores embebidos,
// cambiar de ventana, un panel que pierde y recupera el foco una y otra
// vez): en los logs de producción una sola pestaña llegó a hacer ~1
// petición por segundo (~86.000 al día). Por eso se exige un mínimo entre
// refrescos disparados por foco; el refresco normal al montar/cambiar de
// vista no pasa por aquí.
// Red de seguridad para cambios hechos por otra persona, pestaña o dispositivo (no
// pasan por la API de este cliente): solo al recuperar el foco tras 10 minutos.
export const LIVE_REFRESH_MIN_INTERVAL_MS = 10 * 60_000;

export const useDashboardLiveUpdates = (onChange: () => void) => {
  const onChangeRef = useRef(onChange);
  const lastRefreshAt = useRef(0);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    // El panel acaba de cargar sus datos al montar: cuenta como último refresco.
    lastRefreshAt.current = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshAt.current < LIVE_REFRESH_MIN_INTERVAL_MS) return;
      lastRefreshAt.current = now;
      onChangeRef.current();
    };
    // Otra pestaña o dispositivo guardó algo (aviso del canal por usuario, ver utils/userFeed.ts):
    // con el panel a la vista se refresca ya; si está oculto se refresca al volver a verlo, sin
    // esperar al mínimo entre refrescos por foco.
    let dirtyWhileHidden = false;
    const onDataChanged = () => {
      if (document.visibilityState !== "visible") {
        dirtyWhileHidden = true;
        return;
      }
      lastRefreshAt.current = Date.now();
      onChangeRef.current();
    };
    const onVisibleAfterChange = () => {
      if (document.visibilityState !== "visible" || !dirtyWhileHidden) return;
      dirtyWhileHidden = false;
      lastRefreshAt.current = Date.now();
      onChangeRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", onVisibleAfterChange);
    window.addEventListener("focus", onVisible);
    window.addEventListener(DATA_CHANGED_EVENT, onDataChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onVisibleAfterChange);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged);
    };
  }, []);
};
