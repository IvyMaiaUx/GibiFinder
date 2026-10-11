import { useMemo, useCallback } from "react";
import { PageItem, ReaderMode, ReaderDirection, ReaderLayout, SpreadGroup } from "./readerTypes";

interface UseSpreadNavigationOptions {
  pages: PageItem[];
  currentPage: number;
  mode: ReaderMode;
  direction: ReaderDirection;
  layout: ReaderLayout;
  viewportWidth: number;
  viewportHeight: number;
  onPageChange: (newPageIndex: number) => void;
}

export function useSpreadNavigation({
  pages,
  currentPage,
  mode,
  direction,
  layout,
  viewportWidth,
  viewportHeight,
  onPageChange,
}: UseSpreadNavigationOptions) {
  // Layout auto: double page spread ONLY in landscape (width > height) AND width >= 768px
  const isDoubleLayout = useMemo(() => {
    if (mode === "webtoon" || layout === "single") return false;
    if (layout === "double") return true;
    const isLandscape = viewportWidth > viewportHeight;
    return isLandscape && viewportWidth >= 768;
  }, [mode, layout, viewportWidth, viewportHeight]);

  // Build spread groups for paginated mode
  const spreadGroups: SpreadGroup[] = useMemo(() => {
    if (mode === "webtoon" || !isDoubleLayout) {
      return pages.map((p) => ({
        pages: [p],
        isSpread: false,
        isNativeWide: !!(p.width && p.height && p.width > p.height),
      }));
    }

    const groups: SpreadGroup[] = [];
    let i = 0;
    while (i < pages.length) {
      const page = pages[i];
      const isCover = i === 0;
      const isWide = !!(page.width && page.height && page.width > page.height);

      if (isCover || isWide) {
        // Cover (page 0) or natural wide spread: always alone
        groups.push({
          pages: [page],
          isSpread: false,
          isNativeWide: isWide,
        });
        i++;
      } else {
        // Pair two portrait pages together
        const nextPage = pages[i + 1];
        if (nextPage) {
          const nextIsWide = !!(nextPage.width && nextPage.height && nextPage.width > nextPage.height);
          if (nextIsWide) {
            groups.push({
              pages: [page],
              isSpread: false,
              isNativeWide: false,
            });
            i++;
          } else {
            // In RTL, the right page comes first in reading order: [nextPage, currentPage]
            const spreadPages = direction === "rtl" ? [nextPage, page] : [page, nextPage];
            groups.push({
              pages: spreadPages,
              isSpread: true,
              isNativeWide: false,
            });
            i += 2;
          }
        } else {
          groups.push({
            pages: [page],
            isSpread: false,
            isNativeWide: false,
          });
          i++;
        }
      }
    }
    return groups;
  }, [pages, mode, isDoubleLayout, direction]);

  // Locate the active group based on currentPage index
  const currentGroupIndex = useMemo(() => {
    if (mode === "webtoon") return 0;
    const idx = spreadGroups.findIndex((grp) =>
      grp.pages.some((p) => pages.indexOf(p) >= currentPage)
    );
    return idx >= 0 ? idx : 0;
  }, [spreadGroups, currentPage, pages, mode]);

  const activeGroup = spreadGroups[currentGroupIndex] || spreadGroups[0];

  const handleNext = useCallback(() => {
    if (mode === "webtoon") return;
    if (currentGroupIndex < spreadGroups.length - 1) {
      const nextGrp = spreadGroups[currentGroupIndex + 1];
      const targetPage = nextGrp.pages[0];
      onPageChange(pages.indexOf(targetPage));
    }
  }, [mode, currentGroupIndex, spreadGroups, pages, onPageChange]);

  const handlePrev = useCallback(() => {
    if (mode === "webtoon") return;
    if (currentGroupIndex > 0) {
      const prevGrp = spreadGroups[currentGroupIndex - 1];
      const targetPage = prevGrp.pages[0];
      onPageChange(pages.indexOf(targetPage));
    }
  }, [mode, currentGroupIndex, spreadGroups, pages, onPageChange]);

  return {
    isDoubleLayout,
    spreadGroups,
    currentGroupIndex,
    activeGroup,
    handleNext,
    handlePrev,
    canNext: currentGroupIndex < spreadGroups.length - 1,
    canPrev: currentGroupIndex > 0,
  };
}
