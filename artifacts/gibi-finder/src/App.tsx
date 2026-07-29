import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsSync } from "@/components/reader/SettingsSync";
import { Loader2 } from "lucide-react";

const Home = lazy(() => import("@/pages/Home"));
const History = lazy(() => import("@/pages/History"));
const Ranking = lazy(() => import("@/pages/Ranking"));
const ResultDetail = lazy(() => import("@/pages/ResultDetail"));
const Colecao = lazy(() => import("@/pages/Colecao"));
const Admin = lazy(() => import("@/pages/Admin"));
const Explore = lazy(() => import("@/pages/Explore"));
const Providers = lazy(() => import("@/pages/Providers"));
const ProviderInspector = lazy(() => import("@/pages/ProviderInspector"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-10 h-10 animate-spin text-primary" strokeWidth={2.5} />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/historico" component={History} />
        <Route path="/ranking" component={Ranking} />
        <Route path="/gibi/:id" component={ResultDetail} />
        <Route path="/colecao" component={Colecao} />
        <Route path="/admin" component={Admin} />
        <Route path="/provedores" component={Providers} />
        <Route path="/provedores/inspector" component={ProviderInspector} />
        <Route path="/explorar" component={Explore} />
        <Route path="/login" component={Login} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  useEffect(() => {
    const isNsfw = localStorage.getItem("gibi-finder:nsfw") === "true";
    if (isNsfw) {
      document.documentElement.classList.add("nsfw");
    } else {
      document.documentElement.classList.remove("nsfw");
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <SettingsSync />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
