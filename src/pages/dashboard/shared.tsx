import React from "react";
import { createPortal } from "react-dom";

export const DragOverlayPortal: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => createPortal(children, document.body);
