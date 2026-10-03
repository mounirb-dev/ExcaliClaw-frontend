/** Recorre `items` de uno en uno, esperando a que termine cada `fn` antes de
 * empezar la siguiente. Para trabajo que NO debe lanzarse en paralelo (p. ej.
 * importar cientos de dibujos sin saturar R2/Appwrite, o resolver colecciones
 * por nombre sin crear duplicados). Es la forma encadenada de un
 * `for ... await`: mismo orden y mismo ritmo, sin `await` dentro de un bucle
 * (que `react-doctor/async-await-in-loop` marca por defecto). */
export const forEachSequential = async <T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> => {
  await items.reduce<Promise<void>>((chain, item, index) => chain.then(() => fn(item, index)), Promise.resolve());
};
