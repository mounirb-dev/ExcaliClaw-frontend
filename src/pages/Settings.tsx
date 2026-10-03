import React, { useEffect, useRef, useState } from "react";
import { Layout } from "../components/Layout";
import { useNavigate } from "react-router-dom";
import { DrawablyButton } from "drawably/react";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import { SettingsMainGrid } from "./settings/SettingsMainGrid";
import { TwoFactorModal } from "../components/TwoFactorModal";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { displayFontFamily } from "../utils/displayFont";
import { useCollectionsStore } from "../store/collectionsStore";
import { useT } from "../i18n/useT";

export const Settings: React.FC = () => {
  const collections = useCollectionsStore((s) => s.collections);
  const setCollections = useCollectionsStore((s) => s.setCollections);
  const hydrateCollections = useCollectionsStore((s) => s.hydrate);
  const navigate = useNavigate();
  const [exportError, setExportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const { user, retryAuthStatus } = useAuth();
  const twoFactorEnabled = Boolean(user?.mfaEnabled);
  const { t } = useT();

  useEffect(() => {
    void hydrateCollections();
  }, [hydrateCollections]);

  // Construido del lado del cliente (paginando los datos completos de cada
  // dibujo + cada colección) en vez de un endpoint /export del servidor — el
  // Worker no tiene esa ruta. Todos los dibujos en UN solo .json con el
  // formato `{ drawings: [...] }` que importSingleJsonFile sabe leer de
  // vuelta con "Import Backup", y fácil de abrir/editar a mano o de llevar a
  // otra herramienta. (Antes había además una copia en .zip: ya no se genera,
  // pero importBackupZip sigue leyendo las copias antiguas.)
  const exportBackup = async () => {
    setExportError(null);
    try {
      const allCollections = await api.getCollections();
      const collectionName = new Map(allCollections.map((c) => [c.id, c.name]));
      const summaries: { id: string }[] = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const page = await api.getDrawings(undefined, undefined, { limit, offset });
        summaries.push(...page.drawings);
        if (summaries.length >= page.totalCount || page.drawings.length === 0) break;
        offset += page.drawings.length;
      }
      const drawings = await Promise.all(summaries.map((s) => api.getDrawing(s.id)));
      const payload = {
        version: "2",
        exportedAt: new Date().toISOString(),
        drawings: drawings.map((d) => ({
          id: d.id,
          name: d.name,
          collectionId: d.collectionId,
          collectionName: d.collectionId ? (collectionName.get(d.collectionId) ?? null) : null,
          elements: d.elements,
          appState: d.appState,
          files: d.files,
        })),
      };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `excaliclaw-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("Backup export failed:", err);
      setExportError("Failed to export backup. Please try again.");
    }
  };

  const handleImportBackupFile = async (file: File) => {
    setExportError(null);
    setImportResult(null);
    setIsImporting(true);
    try {
      const isJson = file.name.toLowerCase().endsWith(".json");
      const { importBackupZip, importSingleJsonFile } = await import("../utils/importHelpers");
      const result = isJson ? await importSingleJsonFile(file, null) : await importBackupZip(file, null);
      setImportResult(result);
      if (result.success > 0) {
        await hydrateCollections();
      }
    } catch (err: unknown) {
      console.error("Backup import failed:", err);
      setImportResult({ success: 0, failed: 1, errors: [err instanceof Error ? err.message : "Failed to import backup."] });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateCollection = async (name: string) => {
    await api.createCollection(name);
    const newCollections = await api.getCollections();
    setCollections(newCollections);
  };
  const handleEditCollection = async (id: string, name: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
    await api.updateCollection(id, name);
  };
  const handleDeleteCollection = async (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    await api.deleteCollection(id);
  };
  const handleSelectCollection = (id: string | null | undefined) => {
    if (id === undefined) navigate("/app");
    else if (id === null) navigate("/app/collections?id=unorganized");
    else navigate(`/app/collections?id=${id}`);
  };

  return (
    <Layout
      collections={collections}
      selectedCollectionId="SETTINGS"
      onSelectCollection={handleSelectCollection}
      onCreateCollection={handleCreateCollection}
      onEditCollection={handleEditCollection}
      onDeleteCollection={handleDeleteCollection}
    >
      <h1
        className="text-3xl sm:text-4xl lg:text-5xl mb-2 text-slate-900 dark:text-white pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        {t("settings.title")}
      </h1>
      <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6 lg:mb-8 pl-1 max-w-xl">
        {t("settings.intro")}
      </p>
      {exportError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-800 dark:text-red-200 font-medium">{exportError}</p>
        </div>
      )}
      {importResult && (
        <div
          className={`mb-6 p-4 border-2 rounded-xl ${
            importResult.failed > 0 && importResult.success === 0
              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
              : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
          }`}
        >
          <p className={`font-medium ${importResult.failed > 0 && importResult.success === 0 ? "text-red-800 dark:text-red-200" : "text-emerald-800 dark:text-emerald-200"}`}>
            {t("settings.import.resultPrefix")} {importResult.success} {t("settings.import.resultImported")}
            {importResult.failed > 0 ? `, ${importResult.failed} ${t("settings.import.resultFailed")}` : ""}
          </p>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-700 dark:text-red-300 list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
              {Array.from(new Set(importResult.errors.slice(0, 20))).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.zip,.excaliclaw,.excalidash"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleImportBackupFile(file);
        }}
      />
      <SettingsMainGrid
        exportBackup={exportBackup}
        onImportBackup={() => importInputRef.current?.click()}
        isImporting={isImporting}
        twoFactorEnabled={twoFactorEnabled}
        onOpenTwoFactor={() => setTwoFactorModalOpen(true)}
      />
      <h2
        className="text-2xl sm:text-3xl mt-10 mb-2 text-rose-600 dark:text-rose-400 pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        {t("settings.dangerZone.title")}
      </h2>
      <div className="p-5 sm:p-6 bg-white dark:bg-neutral-900 border-2 border-rose-200 dark:border-rose-900/40 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{t("settings.deleteAccount.title")}</h3>
          <p className="text-sm text-slate-500 dark:text-neutral-400 max-w-lg mt-0.5">{t("settings.deleteAccount.desc")}</p>
        </div>
        <DrawablyButton
          key={t("settings.deleteAccount.cta")}
          type="button"
          variant="solid"
          tone="danger"
          className="shrink-0"
          onClick={() => setDeleteAccountModalOpen(true)}
        >
          {t("settings.deleteAccount.cta")}
        </DrawablyButton>
      </div>

      {twoFactorModalOpen && (
        <TwoFactorModal
          currentlyEnabled={twoFactorEnabled}
          onClose={() => setTwoFactorModalOpen(false)}
          onChanged={() => void retryAuthStatus()}
        />
      )}
      {deleteAccountModalOpen && (
        <DeleteAccountModal
          onClose={() => setDeleteAccountModalOpen(false)}
          onDeleted={() => navigate("/login", { replace: true })}
        />
      )}
    </Layout>
  );
};
