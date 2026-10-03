import React from "react";
import { Plus } from "lucide-react";
import { DrawablyButton } from "drawably/react";

interface NewDrawingControlProps {
  disabled: boolean;
  onCreate: () => void;
  // Compuerta opcional ejecutada antes de crear. Devolver false para
  // abortar (p. ej. un visor en una colección compartida de solo lectura);
  // la compuerta es responsable de mostrar su propio mensaje.
  canCreate?: () => boolean;
}

export const NewDrawingControl: React.FC<NewDrawingControlProps> = ({
  disabled,
  onCreate,
  canCreate,
}) => {
  return (
    <DrawablyButton
      type="button"
      variant="solid"
      className="w-full sm:w-auto"
      onClick={() => {
        if (canCreate && !canCreate()) return;
        onCreate();
      }}
      disabled={disabled}
    >
      <span className="inline-flex items-center justify-center gap-2">
        <Plus size={18} strokeWidth={2.5} /> New Drawing
      </span>
    </DrawablyButton>
  );
};
