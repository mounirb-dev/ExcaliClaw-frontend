// Caché local-first para datos de lista baratos y que rara vez cambian
// (nombres/ids de colecciones y dibujos — nunca el contenido de la escena)
// para que cambiar de vista o volver a enfocar la pestaña no tenga que ir y
// volver del Worker solo para redibujar una barra lateral que no ha
// cambiado. Stale-while-revalidate: un acierto de caché se renderiza al
// instante, un fetch en segundo plano (impulsado por los llamadores en
// collections.ts/drawings.ts) lo refresca y actualiza las lecturas
// posteriores.
//
// Cifrado en reposo con AES-GCM vía la API WebCrypto SubtleCrypto. La
// clave vive en la misma base de datos IndexedDB, no exportable a otros
// orígenes — esto no es una defensa contra un dispositivo comprometido
// (cualquiera con acceso a la página puede pedirle a la página que lo
// descifre, igual que cualquier otra caché del lado del cliente), solo
// mantiene los nombres cacheados fuera de la vista directa en el
// inspector de dev-tools de IndexedDB y en cualquier almacenamiento
// crudo del navegador en disco.

const DB_NAME = "excaliclaw-cache";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";
const STORE_KEYS = "keys";
const CRYPTO_KEY_ID = "aes-key";

// IndexedDB puede no responder nunca (WebViews antiguos de tablet, modo
// privado, base bloqueada por otra pestaña): ni onsuccess ni onerror. Sin
// tope, cualquier `await getCached()` dejaba la pantalla esperando para
// siempre y los dibujos no aparecían. Toda operación de caché se corta a
// CACHE_OP_TIMEOUT_MS y se trata como un miss.
const CACHE_OP_TIMEOUT_MS = 800;

const withTimeout = <T>(promise: Promise<T>, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), CACHE_OP_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });

type CacheEntry<T> = { value: T; cachedAt: number };

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) db.createObjectStore(STORE_ENTRIES);
      if (!db.objectStoreNames.contains(STORE_KEYS)) db.createObjectStore(STORE_KEYS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

const idbGet = async <T>(store: string, key: string): Promise<T | undefined> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
};

const idbSet = async (store: string, key: string, value: unknown): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const idbDelete = async (store: string, key: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

let keyPromise: Promise<CryptoKey> | null = null;

// La clave AES-GCM (WebCrypto) se guarda como objeto CryptoKey NO exportable: el
// código de la página puede usarla para cifrar y descifrar, pero no puede leer sus
// bytes. Las instalaciones anteriores la tenían como JWK exportable; se migra al
// primer uso. Si el navegador no puede clonar un CryptoKey en IndexedDB se vuelve al
// JWK de antes.
const getOrCreateKey = (): Promise<CryptoKey> => {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const stored = await idbGet<CryptoKey | JsonWebKey>(STORE_KEYS, CRYPTO_KEY_ID);
    if (stored && typeof CryptoKey !== "undefined" && stored instanceof CryptoKey) return stored;
    if (stored) {
      const legacy = stored as JsonWebKey;
      const imported = await crypto.subtle.importKey("jwk", legacy, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      try {
        await idbSet(STORE_KEYS, CRYPTO_KEY_ID, imported);
      } catch {
        // Sin soporte para guardar CryptoKey: se sigue con el JWK ya guardado.
      }
      return imported;
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    try {
      await idbSet(STORE_KEYS, CRYPTO_KEY_ID, key);
      return key;
    } catch {
      const exportable = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      await idbSet(STORE_KEYS, CRYPTO_KEY_ID, await crypto.subtle.exportKey("jwk", exportable));
      return exportable;
    }
  })();
  return keyPromise;
};

const encode = new TextEncoder();
const decode = new TextDecoder();

// Formato guardado: bytes reales (Uint8Array, que IndexedDB clona de forma compacta).
// Antes eran arrays de números (8 bytes por byte de contenido), inviable para
// datos de varios MB como la biblioteca. Las entradas antiguas (arrays) se siguen
// leyendo y se reescriben en el nuevo formato la próxima vez que se guarden.
type CipherPayload = { iv: Uint8Array | number[]; data: Uint8Array | number[] };

async function encrypt(plaintext: string): Promise<{ iv: Uint8Array; data: Uint8Array }> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encode.encode(plaintext));
  return { iv, data: new Uint8Array(ciphertext) };
}

async function decrypt(payload: CipherPayload): Promise<string> {
  const key = await getOrCreateKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(payload.iv) },
    key,
    new Uint8Array(payload.data),
  );
  return decode.decode(plaintext);
}

/** Lee un valor cacheado si está presente. Devuelve `undefined` en caso de
 * fallo (miss), un fallo de descifrado (p. ej. la clave cambió), o
 * cualquier error de almacenamiento — los llamadores siempre tienen un
 * fallback de red, así que un fallo de caché nunca debería manifestarse
 * como un error visible para el usuario. */
export function getCached<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
  // skipcq: JS-W1042 — undefined es el fallback deliberado para representar un miss de caché
  return withTimeout(readCached<T>(key, maxAgeMs), undefined);
}

async function readCached<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
  try {
    const raw = await idbGet<CipherPayload>(STORE_ENTRIES, key);
    if (!raw) return undefined;
    const json = await decrypt(raw);
    const entry = JSON.parse(json) as CacheEntry<T>;
    if (Date.now() - entry.cachedAt > maxAgeMs) return undefined;
    return entry.value;
  } catch {
    return undefined;
  }
}

/** Borra TODA la caché local (listas de dibujos y colecciones). Se llama al
 * cambiar de cuenta o cerrar sesión: las claves no llevan el id de usuario,
 * así que sin esto la cuenta siguiente veía unos segundos las listas de la
 * anterior. */
export function clearAllCached(): Promise<void> {
  return withTimeout(
    (async () => {
      try {
        const db = await openDb();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_ENTRIES, "readwrite");
          tx.objectStore(STORE_ENTRIES).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      } catch {
        // Sin IndexedDB no hay nada que borrar.
      }
    })(),
    undefined,
  );
}

/** Borra todas las entradas cuya clave empieza por `prefix` salvo `keepKey`. Se usa para que
 * una copia por versión (miniaturas) no acumule una entrada nueva por cada edición. */
export function deleteCachedByPrefixExcept(prefix: string, keepKey: string): Promise<void> {
  return withTimeout(
    (async () => {
      try {
        const db = await openDb();
        await new Promise<void>((resolve) => {
          const tx = db.transaction(STORE_ENTRIES, "readwrite");
          const store = tx.objectStore(STORE_ENTRIES);
          const cursorRequest = store.openKeyCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            if (cursor.key !== keepKey) store.delete(cursor.primaryKey);
            cursor.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      } catch {
        // Poda de mejor esfuerzo: sin IndexedDB no hay nada que podar.
      }
    })(),
    undefined,
  );
}

/** Borra una entrada concreta (sin tocar el resto de la copia local). */
export function deleteCached(key: string): Promise<void> {
  // skipcq: JS-W1042 — undefined es el fallback deliberado de una operación que expira
  return withTimeout(idbDelete(STORE_ENTRIES, key).catch(() => undefined), undefined);
}

export function setCached<T>(key: string, value: T): Promise<void> {
  // skipcq: JS-W1042 — undefined es el fallback deliberado de una escritura que expira
  return withTimeout(writeCached(key, value), undefined);
}

async function writeCached<T>(key: string, value: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { value, cachedAt: Date.now() };
    const payload = await encrypt(JSON.stringify(entry));
    await idbSet(STORE_ENTRIES, key, payload);
  } catch {
    // Caché de mejor esfuerzo — un fallo de escritura (navegación privada,
    // cuota, etc.) solo significa que la próxima llamada vuelve a golpear
    // la red, igual que un miss.
  }
}
