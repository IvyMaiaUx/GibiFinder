import { useEffect } from "react";

/**
 * The +18 theme (dark background, red accents) is a content-browsing visual
 * — it shouldn't bleed into admin-like screens. The "nsfw" class lives on
 * <html> and is set once by the Header's toggle, so it otherwise persists
 * across SPA navigation (no full reload) into any page, admin included.
 *
 * Call this from the root of any admin-like screen (the login gate AND the
 * authenticated dashboard shell are two separate component trees — both need
 * it) to force the class off for as long as that screen stays mounted, and
 * restore it on unmount so navigating back to a normal page doesn't leave
 * +18 mode looking "off" when it's still on.
 *
 * A one-shot removal isn't enough: App's root-level init effect (empty deps,
 * reads localStorage and (re)applies the class) fires on mount too — and
 * React runs child effects before parent effects, so on a direct load of an
 * admin-like route, App's effect can run after this one and silently re-add
 * "nsfw" right back. A MutationObserver keeps stripping it for as long as
 * this screen stays mounted, regardless of what else touches the class or
 * when. Unmount re-syncs from the actual preference in localStorage rather
 * than a snapshot taken at mount time, since that snapshot can itself go
 * stale once other code changes the class while this screen is up.
 */
export function useSuppressNsfwTheme(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const strip = () => {
      if (document.documentElement.classList.contains("nsfw")) {
        document.documentElement.classList.remove("nsfw");
      }
    };
    strip();
    const observer = new MutationObserver(strip);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      const isNsfw = localStorage.getItem("gibi-finder:nsfw") === "true";
      if (isNsfw) document.documentElement.classList.add("nsfw");
    };
  }, [active]);
}
