import React from "react";
import { ConfirmModal } from "../../components/ConfirmModal";
import type { useDashboardDrawingActions } from "./useDashboardDrawingActions";
import { useT } from "../../i18n/useT";

type DashboardActions = ReturnType<typeof useDashboardDrawingActions>;

interface DashboardConfirmModalsProps {
  actions: DashboardActions;
  selectedCount: number;
}

/** Los tres diálogos de confirmación de eliminar/error de importación que
 * renderiza Dashboard. Extraídos para mantener esa página por debajo del
 * umbral de líneas de componente gigante de react-doctor. */
export const DashboardConfirmModals: React.FC<DashboardConfirmModalsProps> = ({
  actions,
  selectedCount,
}) => {
  const { t } = useT();
  return (
    <>
      <ConfirmModal
        isOpen={Boolean(actions.drawingToDelete)}
        title={t("confirm.delete.title")}
        message={t("confirm.delete.body")}
        confirmText={t("confirm.delete.confirmButton")}
        onConfirm={() =>
          actions.drawingToDelete &&
          actions.executePermanentDelete(actions.drawingToDelete)
        }
        onCancel={() => actions.setDrawingToDelete(null)}
      />
      <ConfirmModal
        isOpen={actions.showBulkDeleteConfirm}
        title={t("confirm.bulkDelete.title")}
        message={`${t("confirm.bulkDelete.bodyPrefix")}${selectedCount}${t("confirm.bulkDelete.bodySuffix")}`}
        confirmText={`${t("confirm.bulkDelete.confirmButtonPrefix")}${selectedCount}${t("confirm.bulkDelete.confirmButtonSuffix")}`}
        onConfirm={actions.executeBulkPermanentDelete}
        onCancel={() => actions.setShowBulkDeleteConfirm(false)}
      />
      <ConfirmModal
        isOpen={actions.showImportError.isOpen}
        title={t("confirm.importError.title")}
        message={actions.showImportError.message}
        confirmText={t("confirm.ok")}
        showCancel={false}
        isDangerous={false}
        onConfirm={() => actions.setShowImportError({ isOpen: false, message: "" })}
        onCancel={() => actions.setShowImportError({ isOpen: false, message: "" })}
      />
    </>
  );
};
