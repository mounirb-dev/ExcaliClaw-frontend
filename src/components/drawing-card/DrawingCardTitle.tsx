import React from "react";
import type { DrawingSummary } from "../../types";
import { useT } from "../../i18n/useT";

interface DrawingCardTitleProps {
  drawing: DrawingSummary;
  isTrash: boolean;
  isShared: boolean;
  isRenaming: boolean;
  newName: string;
  onNewNameChange: (value: string) => void;
  onRenameSubmit: (e: React.FormEvent) => void;
  onRenameCancel: () => void;
  onStartRenaming: () => void;
}

/** El nombre de la tarjeta de dibujo: un formulario de renombrado en línea
 * cuando está activo, o si no un título con doble-clic-para-renombrar.
 * Extraído de DrawingCard para evitar que el flujo de control de ese
 * componente (arrastrar/seleccionar/menú contextual/exportar/almacenamiento)
 * crezca más allá del umbral de complejidad de react-doctor. */
export const DrawingCardTitle: React.FC<DrawingCardTitleProps> = ({
  drawing,
  isTrash,
  isShared,
  isRenaming,
  newName,
  onNewNameChange,
  onRenameSubmit,
  onRenameCancel,
  onStartRenaming,
}) => {
  const { t } = useT();
  if (isRenaming) {
    return (
      <form
        onSubmit={onRenameSubmit}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseLeave={onRenameCancel}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          aria-label={t("cards.title.ariaLabel")}
          value={newName}
          onChange={(e) => onNewNameChange(e.target.value)}
          onBlur={onRenameCancel}
          onDragStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full px-2 py-1 -ml-2 text-sm sm:text-base font-bold text-slate-900 dark:text-white border-2 border-black dark:border-neutral-600 rounded-lg focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] bg-white dark:bg-neutral-800"
        />
      </form>
    );
  }

  const canRename =
    !isTrash &&
    (!isShared ||
      drawing.accessLevel === "edit" ||
      drawing.accessLevel === "owner");

  return (
    <h3
      className="text-sm sm:text-base font-bold text-slate-800 dark:text-neutral-100 truncate cursor-text select-none group-hover:text-neutral-900 dark:group-hover:text-white transition-colors"
      title={drawing.name}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (canRename) onStartRenaming();
      }}
    >
      {drawing.name}
    </h3>
  );
};
