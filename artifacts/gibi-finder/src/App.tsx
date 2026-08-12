import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsSync } from "@/components/reader/SettingsSync";
import { Layout } from "@/components/layout/Layout";
import { Loader2 } from "lucide-react";

const Home = lazy(() => import("@/pages/Home"));
const History = lazy(() => import("@/pages/History"));
const Ranking = lazy(() => import("@/pages/Ranking"));
const ResultDetail = lazy(() => import("@/pages/ResultDetail"));
const Colecao = lazy(() => import("@/pages/Colecao"));
const Admin = lazy(() => import("@/pages/Admin"));
const Explore = lazy(() => import("@/pages/Explore"));
const GenrePage = lazy(() => import("@/pages/GenrePage"));
const Providers = lazy(() => import("@/pages/Providers"));
const ProviderInspector = lazy(() => import("@/pages/ProviderInspector"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Sits inside the persistent Layout's <main> (see Router below), not the
// bare viewport — full min-h-screen here would fight that container's own
// height/padding. Just fills the content area so header/nav never blink
// out from under it while a lazy page chunk loads.
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
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

// Every route except /admin shares this one persistent Layout instance —
// Header/BottomNav used to live inside each page's own <Layout> wrapper, so
// swapping routes unmounted and remounted the whole chrome (a header/nav
// blink on every navigation, plus a bare full-viewport spinner with no
// chrome at all while the next page's lazy chunk loaded). Layout now wraps
// the Suspense/Switch once, so only the inner content swaps.
//
// /admin is deliberately excluded: it manages its own chrome entirely (a
// <Layout minimal> login gate, then a completely different AdminShell after
// auth) and was never designed to sit inside this Layout too.
function MainRoutes() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/historico" component={History} />
          <Route path="/ranking" component={Ranking} />
          <Route path="/gibi/:id" component={ResultDetail} />
          <Route path="/colecao" component={Colecao} />
          <Route path="/provedores" component={Providers} />
          <Route path="/provedores/inspector" component={ProviderInspector} />
          <Route path="/explorar" component={Explore} />
          <Route path="/explorar/genero/:genre" component={GenrePage} />
          <Route path="/login" component={Login} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/admin" component={Admin} />
        <Route>
          <MainRoutes />
        </Route>
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
