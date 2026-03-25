import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquarePlus, X, Send, Loader2, Bug, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function FeedbackButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"sugestao" | "bug">("sugestao");
  const [message, setMessage] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) return;
    setSending(true);
    try {
      const res = await fetch(`${BASE}/api/suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim(), nome: nome.trim() || undefined, email: email.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
      toast({ title: "Recebido! Obrigado pelo feedback 🎉" });
      setTimeout(() => {
        setOpen(false);
        setTimeout(() => { setSent(false); setMessage(""); setNome(""); setEmail(""); setType("sugestao"); }, 300);
      }, 2000);
    } catch {
      toast({ title: "Erro ao enviar", description: "Tente novamente em instantes.", variant: "destructive" });
    } finally { setSending(false); }
  };

  const inp = "w-full border-4 border-black px-3 py-2 font-sans font-bold text-black bg-white focus:outline-none focus:ring-4 focus:ring-secondary text-sm";

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 z-40 bg-black text-white border-4 border-black comic-shadow flex items-center gap-2 px-4 py-3 font-display text-base hover:bg-primary transition-colors"
        title="Enviar feedback"
      >
        <MessageSquarePlus className="w-5 h-5" strokeWidth={2.5} />
        <span className="hidden sm:inline">FEEDBACK</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-white comic-border comic-shadow w-full max-w-md z-10"
            >
              <div className="bg-black text-white px-5 py-3 flex items-center justify-between border-b-4 border-black">
                <h2 className="font-display text-2xl tracking-wide">FALE CONOSCO</h2>
                <button onClick={() => setOpen(false)} className="hover:text-secondary transition-colors">
                  <X className="w-6 h-6" strokeWidth={3} />
                </button>
              </div>

              {sent ? (
                <div className="p-8 text-center">
                  <div className="text-6xl mb-4">🎉</div>
                  <p className="font-display text-3xl text-black">RECEBIDO!</p>
                  <p className="font-sans font-bold text-gray-600 mt-2">Obrigado pelo seu feedback!</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setType("sugestao")}
                      className={`flex-1 flex items-center justify-center gap-2 border-4 border-black py-2 font-display text-base transition-colors ${type === "sugestao" ? "bg-secondary text-black" : "bg-white text-gray-500 hover:bg-muted"}`}
                    >
                      <Lightbulb className="w-4 h-4" strokeWidth={3} /> SUGESTÃO
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("bug")}
                      className={`flex-1 flex items-center justify-center gap-2 border-4 border-black py-2 font-display text-base transition-colors ${type === "bug" ? "bg-red-100 text-black" : "bg-white text-gray-500 hover:bg-muted"}`}
                    >
                      <Bug className="w-4 h-4" strokeWidth={3} /> BUG
                    </button>
                  </div>

                  <div>
                    <label className="block font-display text-sm uppercase text-black mb-1">
                      {type === "bug" ? "Descreva o problema *" : "Sua sugestão *"}
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={type === "bug" ? "O que aconteceu? Como reproduzir?" : "Qual funcionalidade você gostaria de ver?"}
                      rows={4}
                      required
                      minLength={5}
                      className={inp + " resize-none"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-display text-sm uppercase text-black mb-1">Nome (opcional)</label>
                      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" className={inp} />
                    </div>
                    <div>
                      <label className="block font-display text-sm uppercase text-black mb-1">Email (opcional)</label>
                      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Para resposta" type="email" className={inp} />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sending || message.trim().length < 5}
                    className="w-full bg-primary text-white border-4 border-black py-3 font-display text-xl comic-shadow flex items-center justify-center gap-2 disabled:opacity-50 hover:translate-y-[-2px] transition-transform"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" strokeWidth={3} />}
                    ENVIAR
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
