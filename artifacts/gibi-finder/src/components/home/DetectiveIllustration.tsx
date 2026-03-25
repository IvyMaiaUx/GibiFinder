import { motion } from "framer-motion";

export function DetectiveIllustration() {
  return (
    <motion.div 
      className="relative w-64 h-64 md:w-80 md:h-80 mx-auto"
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      <div className="absolute inset-0 rounded-full comic-border comic-shadow overflow-hidden">
        <img
          src="/images/detective.png"
          alt="Detetive Gibi Finder"
          className="w-full h-full object-cover object-center"
        />
      </div>
    </motion.div>
  );
}
