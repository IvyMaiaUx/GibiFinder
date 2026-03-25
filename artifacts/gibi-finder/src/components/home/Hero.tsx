import { motion } from "framer-motion";
import { DetectiveIllustration } from "./DetectiveIllustration";

export function Hero() {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-16 mt-8">
      {/* Left: Detective */}
      <div className="w-full md:w-1/2 flex justify-center md:justify-end">
        <DetectiveIllustration />
      </div>
      {/* Right: Text Content */}
      <div className="w-full md:w-1/2 flex flex-col items-center md:items-start gap-6">
        
        <motion.div 
          className="speech-bubble p-6 max-w-md text-center md:text-left"
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        >
          <h1 className="font-display text-5xl md:text-6xl leading-none uppercase text-[#e63746]">
            QUAL É O GIBI?!
          </h1>
        </motion.div>

        <motion.div 
          className="bg-white p-4 md:p-6 max-w-md comic-border comic-shadow-sm comic-hover"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <p className="font-sans font-bold text-lg md:text-xl text-gray-800 leading-snug">Descubra qualquer HQ a partir de fotos, títulos ou falas!</p>
        </motion.div>

      </div>
    </div>
  );
}
