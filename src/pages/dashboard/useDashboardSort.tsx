import React from "react";
import { Calendar, Clock, FileText } from "lucide-react";
import type { DrawingSortField, SortDirection } from "../../api";
import { usePreference, usePreferences } from "../../context/PreferencesContext";
import { useT } from "../../i18n/useT";

const DEFAULT_SORT_FIELD: DrawingSortField = "updatedAt";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

const isSortField = (value: unknown): value is DrawingSortField =>
  value === "name" || value === "createdAt" || value === "updatedAt";

const isSortDirection = (value: unknown): value is SortDirection =>
  value === "asc" || value === "desc";

export const useDashboardSort = () => {
  const { t } = useT();
  const { updatePreferences } = usePreferences();
  const sortOptions: {
    field: DrawingSortField;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { field: "name", label: t("dashboard.sort.name"), icon: <FileText size={16} /> },
    { field: "createdAt", label: t("dashboard.sort.dateCreated"), icon: <Calendar size={16} /> },
    { field: "updatedAt", label: t("dashboard.sort.dateModified"), icon: <Clock size={16} /> },
  ];
  const [field] = usePreference("dashboardSortField", DEFAULT_SORT_FIELD);
  const [direction] = usePreference(
    "dashboardSortDirection",
    DEFAULT_SORT_DIRECTION,
  );
  const sortConfig = {
    field: isSortField(field) ? field : DEFAULT_SORT_FIELD,
    direction: isSortDirection(direction) ? direction : DEFAULT_SORT_DIRECTION,
  };

  const handleSortFieldChange = (nextField: DrawingSortField) => {
    if (sortConfig.field === nextField) return;
    updatePreferences({
      dashboardSortField: nextField,
      dashboardSortDirection: nextField === "name" ? "asc" : "desc",
    });
  };

  const handleSortDirectionToggle = () => {
    updatePreferences({
      dashboardSortDirection: sortConfig.direction === "asc" ? "desc" : "asc",
    });
  };

  return {
    sortConfig,
    sortOptions,
    currentSortOption:
      sortOptions.find((option) => option.field === sortConfig.field) ??
      sortOptions[0],
    handleSortFieldChange,
    handleSortDirectionToggle,
  };
};
