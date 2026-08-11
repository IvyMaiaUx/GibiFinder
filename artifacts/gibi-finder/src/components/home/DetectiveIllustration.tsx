import { motion } from "framer-motion";
import { useState, useEffect } from "react";

// Both badges already bake in their own circular vignette/ring and the
// "GIBI FINDER" wordmark (the +18 one adds a matching "+18" neon badge) —
// so unlike the old plain detective.png, these aren't wrapped in an extra
// comic-border/rounded-full clip here; that would just double up on the
// artwork's own frame.
const NORMAL_SRC = "/images/detective-badge-normal.png";
const NSFW_SRC = "/images/detective-badge-nsfw.png";

export function DetectiveIllustration() {
  const [isNsfw, setIsNsfw] = useState(() => document.documentElement.classList.contains("nsfw"));

  useEffect(() => {
    const onNsfw = () => setIsNsfw(document.documentElement.classList.contains("nsfw"));
    window.addEventListener("nsfw-change", onNsfw);
    return () => window.removeEventListener("nsfw-change", onNsfw);
  }, []);

  return (
    <motion.div
      className="relative w-64 h-64 md:w-80 md:h-80 mx-auto"
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      <img
        key={isNsfw ? "nsfw" : "normal"}
        src={isNsfw ? NSFW_SRC : NORMAL_SRC}
        alt={isNsfw ? "Detetive Gibi Finder — modo +18" : "Detetive Gibi Finder"}
        className="w-full h-full object-contain animate-in fade-in duration-300"
      />
    </motion.div>
  );
}
