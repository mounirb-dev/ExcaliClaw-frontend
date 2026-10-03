import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Collection } from "../../types";

// Piezas de estado/efectos de Dashboard.tsx extraídas a hooks para que el
// componente de página solo componga: cada una hace una cosa y se entiende
// sin leer el resto.

export type SelectedCollectionId = string | null | undefined;

/** Colección seleccionada, derivada de la URL (/app = todos, ?id=unorganized
 * = sin colección, ?id=<id> = una colección), y navegación para cambiarla. */
export const useSelectedCollection = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const selectedCollectionId = useMemo<SelectedCollectionId>(() => {
    if (location.pathname === "/app") return undefined;
    if (location.pathname === "/app/collections") {
      const id = searchParams.get("id");
      if (id === "unorganized") return null;
      return id || undefined;
    }
    return undefined;
  }, [location.pathname, searchParams]);
  const setSelectedCollectionId = (id: SelectedCollectionId) => {
    if (id === undefined) navigate("/app");
    else if (id === null) navigate("/app/collections?id=unorganized");
    else navigate(`/app/collections?id=${id}`);
  };
  return { selectedCollectionId, setSelectedCollectionId };
};

/** Scroll infinito: pide la siguiente página cuando el centinela (`loaderRef`)
 * entra en pantalla y quedan más dibujos. */
export const useInfiniteScrollTrigger = (
  loaderRef: React.RefObject<HTMLDivElement | null>,
  hasMore: boolean,
  fetchMore: () => void,
) => {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) fetchMore();
      },
      { threshold: 0.1 },
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [fetchMore, hasMore, loaderRef]);
};

/** ¿Hay un archivo arrastrándose sobre el panel? El contador evita el
 * parpadeo de dragenter/dragleave al pasar por encima de los hijos. */
export const useFileDragState = () => {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDraggingFile(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDraggingFile(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setIsDraggingFile(true);
  }, []);
  /** Al soltar: se acaba el arrastre y se reinicia el contador. */
  const resetDrag = useCallback(() => {
    setIsDraggingFile(false);
    dragCounter.current = 0;
  }, []);
  return { isDraggingFile, handleDragEnter, handleDragLeave, handleDragOver, resetDrag };
};

/** Título de la vista según la colección seleccionada. */
export const useViewTitle = (
  selectedCollectionId: SelectedCollectionId,
  collections: Collection[],
  t: (key: string) => string,
): string =>
  useMemo(() => {
    if (selectedCollectionId === undefined) return t("dashboard.title.allDrawings");
    if (selectedCollectionId === null) return t("dashboard.title.unorganized");
    if (selectedCollectionId === "shared") return t("dashboard.title.sharedWithMe");
    if (selectedCollectionId === "trash") return t("dashboard.title.trash");
    const collection = collections.find((c) => c.id === selectedCollectionId);
    return collection ? collection.name : t("dashboard.title.collection");
  }, [selectedCollectionId, collections, t]);
