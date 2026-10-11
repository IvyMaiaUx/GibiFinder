import { useState, useEffect, useRef } from "react";

function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
}

export function useVisualViewport() {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== "undefined" && window.visualViewport
      ? window.visualViewport.height
      : typeof window !== "undefined"
      ? window.innerHeight
      : 0
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" && window.visualViewport
      ? window.visualViewport.width
      : typeof window !== "undefined"
      ? window.innerWidth
      : 0
  );

  const baselineHeightRef = useRef(
    typeof window !== "undefined" ? window.innerHeight : 0
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateReferenceHeight = () => {
      // Only recalculate baseline height if no editable element is currently focused
      if (!isEditableElement(document.activeElement)) {
        baselineHeightRef.current = window.innerHeight;
      }
    };

    const handleViewportChange = () => {
      const vv = window.visualViewport;
      const currentHeight = vv ? vv.height : window.innerHeight;
      const currentWidth = vv ? vv.width : window.innerWidth;

      setViewportHeight(currentHeight);
      setViewportWidth(currentWidth);

      const hasActiveEditable = isEditableElement(document.activeElement);

      if (!hasActiveEditable) {
        // If no editable is focused, keyboard cannot be open (e.g. orientation change or window resize)
        baselineHeightRef.current = window.innerHeight;
        setIsKeyboardOpen(false);
      } else {
        // Editable is focused. Compare against baseline height.
        // A standard keyboard takes at least 150px.
        const diff = baselineHeightRef.current - currentHeight;
        setIsKeyboardOpen(diff > 150);
      }
    };

    const handleFocusOut = () => {
      // Small timeout to allow activeElement to shift to another input if tabbing
      setTimeout(() => {
        if (!isEditableElement(document.activeElement)) {
          baselineHeightRef.current = window.innerHeight;
          setIsKeyboardOpen(false);
        }
      }, 50);
    };

    window.addEventListener("resize", updateReferenceHeight);
    window.addEventListener("orientationchange", updateReferenceHeight);
    document.addEventListener("focusout", handleFocusOut);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportChange);
    }

    return () => {
      window.removeEventListener("resize", updateReferenceHeight);
      window.removeEventListener("orientationchange", updateReferenceHeight);
      document.removeEventListener("focusout", handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportChange);
      }
    };
  }, []);

  return { isKeyboardOpen, viewportHeight, viewportWidth };
}
