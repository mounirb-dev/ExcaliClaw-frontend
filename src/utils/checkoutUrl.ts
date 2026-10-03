/** Devuelve la URL de checkout de Dodo reconstruida SOLO si es https y de
 * `dodopayments.com`; si no, null. La URL viene de una respuesta de red:
 * no se navega a ciegas a ella (redirección abierta). */
export const toDodoCheckoutUrl = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    const hostOk = parsed.hostname === "dodopayments.com" || parsed.hostname.endsWith(".dodopayments.com");
    if (parsed.protocol !== "https:" || !hostOk) return null;
    return `https://${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
};
