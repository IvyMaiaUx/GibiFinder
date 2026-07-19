import { Loader2, Library, Users, MessageSquare, Globe, Clock, Inbox, Send, AlertTriangle } from "lucide-react";
import type { AdminModule } from "./AdminShell";

export interface DashboardStats {
  catalogTotal: number | null;
  catalogLoading: boolean;
  pending: number;
  sent: number;
  usersTotal: number | null;
  feedbackNew: number;
  feedbackTotal: number;
  providersOnline: number;
  providersOffline: number;
  offlineProviders: string[];
}

function StatCard({ icon: Icon, label, value, loading, accent, onClick }: {
  icon: typeof Library; label: string; value: string | number | null; loading?: boolean; accent?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`text-left bg-white border-4 border-black p-4 comic-shadow-sm transition-transform ${onClick ? "hover:translate-y-[-3px]" : ""} ${accent ? "bg-secondary" : ""}`}
    >
      <div className="flex items-center gap-2 text-gray-500 mb-2">
        <Icon className="w-4 h-4" strokeWidth={2.5} />
        <span className="font-display text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-display text-4xl text-black leading-none">
        {loading ? <Loader2 className="w-7 h-7 animate-spin text-primary" /> : (value ?? "—")}
      </div>
    </button>
  );
}

export function AdminDashboard({ stats, onNavigate }: { stats: DashboardStats; onNavigate: (m: AdminModule) => void }) {
  const alerts = stats.offlineProviders.map(p => ({ level: "warn" as const, text: `Provider ${p} offline` }));

  return (
    <div className="space-y-8">
      {/* Live-ish stats we already collect */}
      <div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Library} label="Catálogo" value={stats.catalogTotal} loading={stats.catalogLoading} onClick={() => onNavigate("catalog")} />
          <StatCard icon={Users} label="Usuários" value={stats.usersTotal} loading={stats.usersTotal === null} onClick={() => onNavigate("users")} />
          <StatCard icon={Inbox} label="Pendentes" value={stats.pending} onClick={() => onNavigate("catalog")} accent={stats.pending > 0} />
          <StatCard icon={Send} label="Enviados" value={stats.sent} onClick={() => onNavigate("catalog")} />
          <StatCard icon={MessageSquare} label="Feedback novo" value={stats.feedbackNew} onClick={() => onNavigate("feedback")} accent={stats.feedbackNew > 0} />
          <StatCard icon={MessageSquare} label="Feedback total" value={stats.feedbackTotal} onClick={() => onNavigate("feedback")} />
          <StatCard icon={Globe} label="Providers on" value={stats.providersOnline} onClick={() => onNavigate("providers")} />
          <StatCard icon={Globe} label="Providers off" value={stats.providersOffline} onClick={() => onNavigate("providers")} accent={stats.providersOffline > 0} />
        </div>
      </div>

      {/* Alerts */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Alertas</h2>
        {alerts.length === 0 ? (
          <div className="bg-white border-4 border-dashed border-black/40 p-6 text-center font-sans font-bold text-gray-400">
            Nenhum alerta ativo. Tudo funcionando. ✅
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="bg-white border-4 border-black border-l-8 border-l-primary px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-primary shrink-0" strokeWidth={2.5} />
                <span className="font-sans font-bold text-gray-800">{a.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity — telemetry not collected yet */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3 flex items-center gap-2"><Clock className="w-5 h-5" /> Atividade recente</h2>
        <div className="bg-white border-4 border-dashed border-black/40 p-6 text-center">
          <p className="font-display text-xl text-black/40">EM BREVE</p>
          <p className="font-sans font-bold text-gray-400 text-sm mt-1">
            Auditoria de ações (quem editou o quê, quando) chega quando o log de atividades for ligado.
          </p>
        </div>
      </div>
    </div>
  );
}
