import { useEffect } from "react";

const SITE_NAME = "Gibi Finder";
const SITE_ORIGIN = "https://gibi-finder.vercel.app";
const DEFAULT_TITLE = "Gibi Finder";
const DEFAULT_DESCRIPTION = "O buscador e leitor definitivo de quadrinhos e mangás. Encontre, salve em sua estante e leia de forma limpa e sem anúncios.";

export interface DocumentMetaOptions {
  /** Page title, WITHOUT the "| Gibi Finder" suffix — it's appended automatically. */
  title?: string;
  description?: string;
  /** Path (e.g. "/explorar") used to build the canonical URL. Omit for pages
   *  that shouldn't claim a canonical of their own (e.g. duplicated by query
   *  params). */
  path?: string;
  /** Private/user-specific pages (login, coleção, histórico) that search
   *  engines shouldn't index. */
  noindex?: boolean;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function removeCanonical() {
  document.head.querySelector('link[rel="canonical"]')?.remove();
}

function upsertRobots(content: string | null) {
  const el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!content) { el?.remove(); return; }
  upsertMeta("name", "robots", content);
}

/**
 * Sets document.title, the description meta, canonical link and (for
 * private pages) a noindex robots tag for the lifetime of the calling
 * component. Restores the site defaults on unmount so navigating away never
 * leaves a stale title/description behind for the next route to inherit.
 *
 * No SSR/pre-rendering involved — this is a client-side-only improvement.
 * It still helps real discovery (Googlebot renders JS before indexing) and
 * fixes the tab title / share-sheet title, but true crawl-time metadata for
 * public pages still needs SSR or pre-rendering to fully land.
 */
export function useDocumentMeta({ title, description, path, noindex }: DocumentMetaOptions) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
    document.title = fullTitle;
    upsertMeta("name", "description", description || DEFAULT_DESCRIPTION);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description || DEFAULT_DESCRIPTION);

    if (path) {
      upsertCanonical(`${SITE_ORIGIN}${path}`);
      upsertMeta("property", "og:url", `${SITE_ORIGIN}${path}`);
    }
    if (noindex) upsertRobots("noindex, nofollow");

    return () => {
      document.title = DEFAULT_TITLE;
      upsertMeta("name", "description", DEFAULT_DESCRIPTION);
      upsertMeta("property", "og:title", DEFAULT_TITLE);
      upsertMeta("property", "og:description", DEFAULT_DESCRIPTION);
      if (path) {
        removeCanonical();
        upsertMeta("property", "og:url", `${SITE_ORIGIN}/`);
      }
      if (noindex) upsertRobots(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, noindex]);
}
