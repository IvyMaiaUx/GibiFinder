import { motion } from "framer-motion";

export function DetectiveIllustration() {
  return (
    <motion.div 
      className="relative w-64 h-64 md:w-80 md:h-80 mx-auto"
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      {/* Background Circle */}
      <div className="absolute inset-0 bg-primary rounded-full comic-border comic-shadow"></div>
      
      {/* SVG Character */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full drop-shadow-[4px_4px_0_rgba(0,0,0,1)]">
        {/* Hat */}
        <path d="M40,90 Q100,60 160,90 L180,100 L20,100 Z" fill="#F4D03F" stroke="black" strokeWidth="6" strokeLinejoin="round"/>
        <path d="M60,90 L60,40 Q100,20 140,40 L140,90 Z" fill="#F4D03F" stroke="black" strokeWidth="6" strokeLinejoin="round"/>
        <path d="M60,75 L140,75" stroke="black" strokeWidth="6"/>
        
        {/* Face Silhouette */}
        <path d="M70,100 L70,140 Q100,170 130,140 L130,100 Z" fill="#E5E5E5" stroke="black" strokeWidth="6" strokeLinejoin="round"/>
        
        {/* Trenchcoat collar */}
        <path d="M50,140 L100,180 L150,140 L180,200 L20,200 Z" fill="#8B4513" stroke="black" strokeWidth="6" strokeLinejoin="round"/>
        
        {/* Magnifying Glass */}
        <circle cx="120" cy="120" r="30" fill="#E0F7FA" fillOpacity="0.8" stroke="black" strokeWidth="8"/>
        <circle cx="115" cy="115" r="10" fill="white" fillOpacity="0.8"/>
        <path d="M140,140 L170,170" stroke="black" strokeWidth="12" strokeLinecap="round"/>
        
        {/* Expression/Eyes (hidden behind glass/hat, just a shadow) */}
        <path d="M80,110 L100,115" stroke="black" strokeWidth="4" strokeLinecap="round"/>
      </svg>
    </motion.div>
  );
}
