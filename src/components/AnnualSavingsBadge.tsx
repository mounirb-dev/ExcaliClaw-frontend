import React from "react";
import { DrawablyBadge } from "drawably/react";

// Etiqueta "2 meses gratis" de las tarjetas de los planes de pago. Es el ÚNICO sitio que decide cuándo
// se muestra (solo con el periodo anual y en un plan de pago), y lo comparten la pantalla de planes de
// /app y la página de precios de la landing, para que no se desajusten.

interface AnnualSavingsBadgeProps {
  /** Hay seleccionado el periodo anual. */
  isYearly: boolean;
  /** El plan es de pago (Free no tiene periodo ni ahorro). */
  isPaid: boolean;
  /** Texto ya traducido (cada app tiene su propio sistema de traducciones). */
  label: string;
}

export const AnnualSavingsBadge: React.FC<AnnualSavingsBadgeProps> = ({ isYearly, isPaid, label }) => {
  if (!isYearly || !isPaid) return null;
  return (
    <div className="-mt-2">
      <DrawablyBadge variant="outline">
        <span>{label}</span>
      </DrawablyBadge>
    </div>
  );
};
