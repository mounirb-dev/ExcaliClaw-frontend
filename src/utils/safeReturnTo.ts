/** Solo permite rutas relativas del mismo origen como destino de
 * redirección tras el login. `returnTo` viene directamente de un parámetro
 * de consulta de la URL — un valor crudo aquí sería una redirección
 * abierta (un atacante crea un enlace de login con
 * `?returnTo=https://evil.example`, y una vez que la víctima se autentica,
 * esta app envía su navegador ya conectado directo a la página del
 * atacante). `//evil.example` y `/\evil.example` también se rechazan: los
 * navegadores tratan ambos como URLs absolutas relativas al protocolo, no
 * como rutas. */
export const getSafeReturnTo = (value: string | null, fallback = "/app"): string => {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
};
