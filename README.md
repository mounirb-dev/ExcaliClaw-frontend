# ExcaliClaw — cliente web

Cliente web (SPA de React + Vite) de [ExcaliClaw](https://excaliclaw.com): panel y editor de
diagramas dibujados a mano, con colaboración en tiempo real.

Este repositorio contiene **solo el frontend**. El servicio (API, colaboración en vivo, facturación,
servidor MCP) no forma parte de él, así que por sí solo no es un producto utilizable: necesita un
backend compatible que hable el mismo protocolo (autenticación con Appwrite, API REST bajo
`/auth`, `/drawings`, `/collections`…, y la sala de colaboración por WebSocket).

## Desarrollo

```bash
cp .env.example .env     # ajusta las variables VITE_* a tu backend
npm install
npm run dev              # servidor de desarrollo en :6767
npm run build            # tsc -b + vite build
npm test                 # vitest
npm run lint
```

## Licencia y avisos de terceros

### Qué contiene este repositorio y bajo qué licencia

Este repositorio contiene el frontend de ExcaliClaw, la parte que se entrega al navegador de los
usuarios. Se distribuye bajo la **GNU Lesser General Public License v3.0 (LGPL-3.0)**; el texto está
en [`LICENSE`](LICENSE). Puedes estudiar el código, modificarlo, hacer forks y redistribuir versiones
modificadas en los términos de esa licencia.

El repositorio incluye el código fuente del frontend a partir del cual se genera la aplicación web
(`src/`, `index.html`, `public/`, `scripts/` y los archivos de configuración de compilación), junto
con las instrucciones de compilación de la sección *Desarrollo*. Las dependencias se instalan desde
sus propios paquetes con `npm install` y conservan su licencia.

### Origen: ExcaliDash

Este frontend está basado en parte en [ExcaliDash](https://github.com/ZimengXiong/ExcaliDash), de
**Zimeng Xiong** y sus contribuidores (Adrian Acala, OhYee, BoxBoxJason, Davi Fernandes Rezende,
Davidutz_, Jyotirmoy Bandyopadhyaya), publicado también bajo LGPL-3.0. Contiene modificaciones y
código original del equipo de ExcaliClaw. Esas modificaciones se publican bajo la misma licencia.

Aquí se publica una instantánea del código **sin historial de commits**. La autoría original se
conserva en este README, en [`LICENSE`](LICENSE) y en [`NOTICE`](NOTICE); el historial completo de
ExcaliDash es público en su repositorio.

### Terceros

El editor usa [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT). Los avisos de copyright y
las licencias de las dependencias de terceros están en [`NOTICE`](NOTICE) y no se modifican: cada
componente sigue bajo su propia licencia. Este README no cambia la licencia de ninguna dependencia.

### Lo que NO forma parte de este repositorio

El backend, la API, la infraestructura, el servidor MCP, la facturación y demás componentes del lado
del servidor de ExcaliClaw **no están incluidos en este repositorio** y **este README no los licencia
bajo la LGPL-3.0**. El frontend se comunica con ese backend mediante interfaces HTTP y WebSocket.

### Marca

El nombre «ExcaliClaw», su logo, su mascota, su identidad visual y su dominio **no están licenciados
bajo la LGPL-3.0**, y una licencia de software no concede derechos sobre marcas. Por eso este
repositorio no incluye el logo ni los iconos de la marca: el componente `Logo` es un símbolo neutral
y `index.html` no enlaza iconos. Si publicas una versión modificada, usa tu propio nombre e identidad
visual y no la presentes como el servicio oficial de ExcaliClaw.

Este apartado informa sobre las licencias del repositorio y no constituye asesoramiento jurídico.
