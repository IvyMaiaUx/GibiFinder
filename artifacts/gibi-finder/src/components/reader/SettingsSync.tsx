import { useAuth } from "@/hooks/use-auth";
import { useSettingsSync } from "./useReaderSettings";

/** Mounts the cross-device reader-settings sync once the user is known. */
export function SettingsSync() {
  const { user } = useAuth();
  useSettingsSync(user?.id);
  return null;
}
