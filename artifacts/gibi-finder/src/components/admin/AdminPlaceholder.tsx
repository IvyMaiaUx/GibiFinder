import { Construction } from "lucide-react";

export function AdminPlaceholder({ title, description, sections }: { title: string; description: string; sections: string[] }) {
  return (
    <div className="bg-white border-4 border-black comic-shadow p-8 md:p-12">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-secondary border-4 border-black p-2"><Construction className="w-6 h-6" strokeWidth={2.5} /></div>
        <div>
          <h2 className="font-display text-3xl text-black leading-none">{title}</h2>
          <p className="font-display text-sm text-black/50 tracking-widest">EM CONSTRUÇÃO</p>
        </div>
      </div>
      <p className="font-sans font-bold text-gray-600 max-w-2xl mb-6">{description}</p>
      <div className="flex flex-wrap gap-2">
        {sections.map(s => (
          <span key={s} className="font-display text-sm px-3 py-1.5 border-4 border-black bg-muted text-gray-600">{s}</span>
        ))}
      </div>
    </div>
  );
}
