/* eslint-disable react-hooks/refs -- el diálogo se crea como elemento React y recibe una ref estable para ejecutar la importación al confirmar. */

import { createElement, useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { toast } from "sonner";
import * as api from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";

type UseLibraryImportFromUrlParams = {
  excalidrawAPIRef: RefObject<ExcalidrawImperativeAPI | null>;
  isReady: boolean;
  user: unknown;
};

export const useLibraryImportFromUrl = ({
  excalidrawAPIRef,
  isReady,
  user,
}: UseLibraryImportFromUrlParams) => {
  const [pendingImport, setPendingImport] = useState<URL | null>(null);
  const importLibraryFromUrl = useCallback(async (parsedUrl: URL) => {
    try {
      const isLocalhost =
        parsedUrl.hostname === "localhost" ||
        parsedUrl.hostname === "127.0.0.1" ||
        parsedUrl.hostname === "::1";
      if (
        !import.meta.env.DEV &&
        parsedUrl.protocol === "http:" &&
        !isLocalhost
      ) {
        throw new Error("Insecure http:// library URL is not allowed");
      }
      toast.loading("Importing library...", { id: "library-import" });
      const response = await fetch(parsedUrl.toString(), { credentials: "omit" });
      if (!response.ok) throw new Error(`Failed to fetch library: ${response.statusText}`);
      const blob = await response.blob();
      if (blob.size > 10 * 1024 * 1024) throw new Error("Library file is too large");
      const updatedItems = await excalidrawAPIRef.current?.updateLibrary({
        libraryItems: blob,
        merge: true,
        defaultStatus: "published",
        openLibraryMenu: true,
      });
      if (user && updatedItems) await api.updateLibrary(updatedItems);
      toast.success("Library imported successfully", { id: "library-import" });
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch (err) {
      console.error("[Editor] Failed to import library:", err);
      toast.error("Failed to import library", { id: "library-import" });
    }
  }, [excalidrawAPIRef, user]);

  // react-doctor-disable-next-line react-doctor/no-fetch-in-effect -- false positive: this is a one-shot imperative action synchronizing with the URL hash and the Excalidraw ref once the editor becomes ready (confirm dialog, toast, direct `excalidrawAPIRef.current.updateLibrary()` call) — it sets no React state, so a data-fetching layer/Server Component doesn't apply.
  useEffect(() => {
    if (!isReady || !excalidrawAPIRef.current) return;
    const hash = window.location.hash;
    if (!hash.includes("addLibrary=")) return;
    const params = new URLSearchParams(hash.slice(1));
    const libraryUrl = params.get("addLibrary");
    if (!libraryUrl) return;
    const importLibrary = async () => {
      try {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(libraryUrl, window.location.href);
        } catch {
          throw new Error("Invalid library URL");
        }
        if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
          throw new Error("Library URL must use http(s)");
        }
        const isCrossOrigin = parsedUrl.origin !== window.location.origin;
        if (isCrossOrigin) {
          setPendingImport(parsedUrl);
          return;
        }
        await importLibraryFromUrl(parsedUrl);
      } catch (err) {
        console.error("[Editor] Failed to import library:", err);
        toast.error("Failed to import library", { id: "library-import" });
      }
    };
    importLibrary();
  }, [excalidrawAPIRef, importLibraryFromUrl, isReady]);

  return {
    confirmDialog: createElement(ConfirmModal, {
      isOpen: pendingImport !== null,
      title: "Import external library?",
      message: `Only continue if you trust this source: ${pendingImport?.origin ?? ""}`,
      confirmText: "Import",
      cancelText: "Cancel",
      onConfirm: () => {
        const url = pendingImport;
        setPendingImport(null);
        if (url) void importLibraryFromUrl(url);
      },
      onCancel: () => {
        setPendingImport(null);
        toast.info("Library import canceled", { id: "library-import" });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      },
    }),
  };
};
