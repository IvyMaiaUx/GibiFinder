import { Server, Database, HardDrive, Cloud, Users as UsersIcon, Library, Globe, Construction } from "lucide-react";

export interface SystemInfo {
  diag?: any;
  catalogTotal: number | null;
  usersTotal: number | null;
  providersOnline: number;
  providersOffline: number;
}

function HealthCard({ icon: Icon, label, ok, detail }: { icon: typeof Server; label: string; ok: boolean | null; detail: string }) {
  const color = ok === null ? "#9ca3af" : ok ? "#16a34a" : "#dc2626";
  return (
    <div className="bg-white border-4 border-black p-4 flex items-start gap-3">
      <div className="border-2 border-black p-2 shrink-0" style={{ background: color, color: "#fff" }}><Icon className="w-5 h-5" strokeWidth={2.5} /></div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-base">{label}</span>
          <span className="w-2.5 h-2.5 rounded-full border border-black" style={{ background: color }} />
        </div>
        <p className="font-sans font-bold text-gray-500 text-xs mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

export function AdminSystem({ info }: { info: SystemInfo }) {
  const bib = info.diag?.cache?.["biblioteca-br"];
  const cachePersisted: boolean | null = bib ? !!bib.persisted : null;
  const driveKey: boolean | null = info.diag ? !!info.diag.driveKey : null;
  // If any admin data loaded at all, the API + Supabase are reachable.
  const apiOk = true;
  const supabaseOk: boolean | null = info.usersTotal !== null || cachePersisted !== null ? true : null;

  const updated = bib?.updatedAt ? new Date(bib.updatedAt).toLocaleString("pt-BR") : "—";

  return (
    <div className="space-y-8">
      {/* Saúde */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3">Saúde do sistema</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <HealthCard icon={Server} label="API" ok={apiOk} detail="Backend respondendo (Vercel)" />
          <HealthCard icon={Database} label="Supabase" ok={supabaseOk} detail={supabaseOk ? "Banco acessível" : "Sem resposta"} />
          <HealthCard icon={Cloud} label="Google Drive API" ok={driveKey} detail={driveKey ? "Chave configurada" : driveKey === false ? "GOOGLE_DRIVE_API_KEY ausente" : "—"} />
          <HealthCard icon={HardDrive} label="Cache do catálogo" ok={cachePersisted} detail={cachePersisted ? `Persistido · ${bib?.remoteCount ?? 0} itens` : cachePersisted === false ? "Não persiste (rode o SQL)" : "—"} />
          <HealthCard icon={Library} label="Catálogo" ok={info.catalogTotal !== null ? info.catalogTotal > 0 : null} detail={`${info.catalogTotal ?? "—"} obras · atualizado ${updated}`} />
          <HealthCard icon={Globe} label="Providers" ok={info.providersOffline === 0 ? true : info.providersOnline > 0 ? null : false} detail={`${info.providersOnline} online · ${info.providersOffline} offline`} />
        </div>
        {info.diag?.errors && Object.keys(info.diag.errors).length > 0 && (
          <p className="font-sans font-bold text-red-600 text-xs mt-2">Erros de provider: {Object.entries(info.diag.errors).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
        )}
      </div>

      {/* Números */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3">Números</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border-4 border-black p-4"><div className="flex items-center gap-2 text-gray-500 mb-1"><Library className="w-4 h-4" /><span className="font-display text-xs uppercase">Catálogo</span></div><div className="font-display text-3xl">{info.catalogTotal ?? "—"}</div></div>
          <div className="bg-white border-4 border-black p-4"><div className="flex items-center gap-2 text-gray-500 mb-1"><UsersIcon className="w-4 h-4" /><span className="font-display text-xs uppercase">Usuários</span></div><div className="font-display text-3xl">{info.usersTotal ?? "—"}</div></div>
          <div className="bg-white border-4 border-black p-4"><div className="flex items-center gap-2 text-gray-500 mb-1"><Globe className="w-4 h-4" /><span className="font-display text-xs uppercase">Providers on</span></div><div className="font-display text-3xl">{info.providersOnline}</div></div>
          <div className="bg-white border-4 border-black p-4"><div className="flex items-center gap-2 text-gray-500 mb-1"><Globe className="w-4 h-4" /><span className="font-display text-xs uppercase">Providers off</span></div><div className="font-display text-3xl">{info.providersOffline}</div></div>
        </div>
      </div>

      {/* Infra — depende de instrumentação */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3 flex items-center gap-2"><Construction className="w-5 h-5" /> Infraestrutura</h2>
        <div className="bg-white border-4 border-dashed border-black/40 p-6">
          <p className="font-display text-lg text-black/40 mb-2">EM BREVE</p>
          <p className="font-sans font-bold text-gray-500 text-sm mb-4">Jobs, cron, filas, backups, deploy e logs em tempo real dependem de instrumentação do runtime — chegam quando ligarmos a telemetria.</p>
          <div className="flex flex-wrap gap-2">
            {["Jobs", "Cron", "Filas", "Backups", "Deploy", "Logs", "Feature flags", "Variáveis"].map(s => (
              <span key={s} className="font-display text-sm px-3 py-1.5 border-4 border-black bg-muted text-gray-500">{s}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
