import React from "react";
import { Users } from "lucide-react";
import type { CollectionShareRow } from "../types";
import { RoleSelect } from "./RoleSelect";
import { useT } from "../i18n/useT";

interface SharesListProps {
  owner: { name?: string; email?: string } | null | undefined;
  /** Si la persona que actualmente ve este modal ES el propietario — solo
   * entonces la fila del propietario obtiene el sufijo "(you)". Un usuario
   * con acceso concedido que ve un recurso compartido con él ve el
   * nombre/email del propietario real en vez del suyo propio (ver
   * ShareCollectionModal, que resuelve esto a partir del campo `owner` del
   * endpoint de shares, no del usuario conectado). */
  isViewerOwner: boolean;
  shares: CollectionShareRow[];
  onRoleChange: (userId: string, value: string) => void;
}

/** La sección "People with access" de ShareCollectionModal: la fila del
 * propietario más la fila de cada usuario con acceso concedido junto con
 * un selector de rol. Extraída para mantener el modal por debajo del
 * umbral de líneas de componente gigante de react-doctor. */
export const SharesList: React.FC<SharesListProps> = ({ owner, isViewerOwner, shares, onRoleChange }) => {
  const { t } = useT();
  return (
  <section className="space-y-2">
    <h3 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 px-1">
      {t("modal.share.peopleWithAccess")}
    </h3>

    <div className="space-y-0.5">
      {/* Fila del propietario */}
      <div className="flex items-center gap-3 px-1 py-1.5 min-h-[48px]">
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-neutral-300 font-bold text-sm border-2 border-black dark:border-neutral-600 shrink-0">
          {owner?.name?.charAt(0).toUpperCase() ?? "U"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-slate-900 dark:text-neutral-100 leading-tight">
            {owner?.name}
            {isViewerOwner && (
              <span className="text-slate-400 dark:text-neutral-500 font-semibold ml-1">
                ({t("modal.share.you")})
              </span>
            )}
          </div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-neutral-400 mt-0.5">
            {owner?.email}
          </div>
        </div>
        <div className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 pr-4 shrink-0">
          {t("modal.share.owner")}
        </div>
      </div>

      {shares.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-slate-400 dark:text-neutral-500">
          <Users size={28} strokeWidth={1.5} />
          <p className="text-xs font-bold">{t("modal.share.noAccessYet")}</p>
        </div>
      )}

      {shares.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-3 px-1 py-1.5 min-h-[48px] group"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm border-2 border-indigo-600 dark:border-indigo-500 shrink-0">
            {s.granteeUser.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-neutral-100 leading-tight truncate">
              {s.granteeUser.name}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 dark:text-neutral-400 mt-0.5 truncate">
              {s.granteeUser.email}
            </div>
          </div>
          <div className="shrink-0">
            <RoleSelect
              value={s.role}
              onChange={(val) => onRoleChange(s.granteeUserId, val)}
              extraOptions={[
                {
                  label: t("modal.share.removeAccess"),
                  value: "remove",
                  danger: true,
                },
              ]}
            />
          </div>
        </div>
      ))}
    </div>
  </section>
  );
};
