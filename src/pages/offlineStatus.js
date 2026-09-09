import { useEffect, useState } from "react";
import { getQueue } from "./offlineStore";

export function useOfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      setOnline(navigator.onLine);
      try {
        setPending((await getQueue()).length);
      } catch {
        setPending(0);
      }
    };
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      clearInterval(timer);
    };
  }, []);

  return { online, pending };
}

export function OfflineBanner() {
  const { online, pending } = useOfflineStatus();
  if (online && pending === 0) return null;

  return (
    <div
      style={{
        marginBottom: "12px",
        padding: "10px 12px",
        borderRadius: "8px",
        background: online ? "rgba(255,180,0,0.15)" : "rgba(255,80,80,0.15)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      {online ? `🔄 ${pending} change${pending === 1 ? "" : "s"} waiting to sync` : "📴 Offline mode — changes are saved on this device and will sync when online."}
    </div>
  );
}
