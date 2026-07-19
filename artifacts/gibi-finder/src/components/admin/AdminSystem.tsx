import { Server, Database, HardDrive, Cloud, Users as UsersIcon, Library, Globe, Key, Table, XCircle } from "lucide-react";

export interface SystemInfo {
  diag?: any;
  catalogTotal: number | null;
  usersTotal: number | null;
  providersOnline: number;
  providersOffline: number;
  env?: Record<string, boolean>;
  tables?: Record<string, boolean>;
}

const ENV_LABELS: Record<string, string> = {
  supabase: "Supabase", driveKey: "Google Drive API", groqKey: "Groq (IA)", geminiKey: "Gemini / Google AI",
};

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

      {/* Ambiente (chaves de API configuradas — nunca os segredos) */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3 flex items-center gap-2"><Key className="w-5 h-5" /> Ambiente</h2>
        {info.env ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(info.env).map(([k, v]) => (
              <div key={k} className={`border-4 border-black p-3 ${v ? "bg-green-50" : "bg-red-50"}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border border-black" style={{ background: v ? "#16a34a" : "#dc2626" }} />
                  <span className="font-display text-sm">{ENV_LABELS[k] || k}</span>
                </div>
                <p className="font-sans font-bold text-2xs mt-1" style={{ color: v ? "#16a34a" : "#dc2626" }}>{v ? "Configurado" : "Ausente"}</p>
              </div>
            ))}
          </div>
        ) : <p className="font-sans font-bold text-gray-400 text-sm">Carregando…</p>}
      </div>

      {/* Tabelas do banco */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3 flex items-center gap-2"><Table className="w-5 h-5" /> Tabelas do banco</h2>
        {info.tables && Object.keys(info.tables).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(info.tables).map(([t, ok]) => (
              <span key={t} className={`inline-flex items-center gap-1.5 text-xs font-bold border-2 border-black px-2 py-1 ${ok ? "bg-green-100" : "bg-red-100"}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: ok ? "#16a34a" : "#dc2626" }} />
                <span className="font-mono">{t}</span>
              </span>
            ))}
          </div>
        ) : <p className="font-sans font-bold text-gray-400 text-sm">Carregando…</p>}
        {info.tables && Object.values(info.tables).some(v => !v) && (
          <p className="font-sans font-bold text-red-600 text-xs mt-2">Tabelas em vermelho não existem — rode o SQL de schema correspondente.</p>
        )}
      </div>

      {/* Serviços ainda não configurados (honesto, sem métrica falsa) */}
      <div>
        <h2 className="font-display text-2xl text-black mb-3">Serviços</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {["Jobs em background", "Cron", "Filas", "Backups automáticos", "Deploy hooks", "Logs centralizados"].map(s => (
            <div key={s} className="border-4 border-black bg-muted/40 p-3 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
              <div><span className="font-display text-sm">{s}</span><p className="font-sans font-bold text-2xs text-gray-400">Não configurado</p></div>
            </div>
          ))}
        </div>
        <p className="font-sans font-bold text-gray-400 text-xs mt-2">Hoje o deploy é direto (push → Vercel) e o cache do catálogo se renova sozinho a cada 6h. Jobs/cron/filas/backups exigem infra dedicada — quando fizer sentido, a gente liga.</p>
      </div>
    </div>
  );
}
