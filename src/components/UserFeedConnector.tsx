import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { authRefresh } from "../api/auth";
import { invalidateLibraryCache } from "../api/collections";
import { CLIENT_ID } from "../utils/clientId";
import { startUserFeed } from "../utils/userFeed";

const getWorkerBaseUrl = () =>
  import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL !== "/api"
    ? import.meta.env.VITE_API_URL
    : window.location.origin;

/** Mantiene abierto el canal de avisos "tus datos cambiaron" mientras haya sesión (ver
 * utils/userFeed.ts). No pinta nada. */
export const UserFeedConnector: React.FC = () => {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const url = `${getWorkerBaseUrl().replace(/^http/, "ws")}/feed/ws?cid=${encodeURIComponent(CLIENT_ID)}`;
    return startUserFeed({ url, onLibraryChanged: invalidateLibraryCache, refreshSession: authRefresh });
  }, [userId]);

  return null;
};
