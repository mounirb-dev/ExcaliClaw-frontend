/**
 * Excalidraw hace zoom con ctrl/cmd+rueda y desplaza con rueda simple. Este
 * proyecto invierte eso en el canvas para que una rueda simple haga zoom:
 * intercepta los eventos de rueda simple sobre el canvas (no el chrome de
 * UI del editor) y los vuelve a despachar como ctrl+rueda sintético.
 * Devuelve una limpieza que desconecta el listener.
 */
export const attachCanvasZoomForwarding = (
  container: HTMLElement | null,
): (() => void) => {
  if (!container) return () => { /* sin acción: no hay contenedor que escuchar */ };
  const handleWheel = (event: WheelEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const isCanvas = target.tagName?.toLowerCase() === "canvas";
    const isEditorUi =
      target.closest(".layer-ui__wrapper") !== null ||
      target.closest(".App-menu") !== null;
    if (
      isCanvas &&
      !isEditorUi &&
      !event.ctrlKey &&
      !event.metaKey &&
      !((event as WheelEvent & { _isFakeZoom?: boolean })._isFakeZoom)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const zoomEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: true,
      });
      (zoomEvent as WheelEvent & { _isFakeZoom?: boolean })._isFakeZoom = true;
      target.dispatchEvent(zoomEvent);
    }
  };
  container.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });
  return () =>
    container.removeEventListener("wheel", handleWheel, { capture: true });
};
