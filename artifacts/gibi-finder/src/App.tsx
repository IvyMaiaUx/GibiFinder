import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import History from "@/pages/History";
import Ranking from "@/pages/Ranking";
import ResultDetail from "@/pages/ResultDetail";
import Colecao from "@/pages/Colecao";
import Admin from "@/pages/Admin";
import Explore from "@/pages/Explore";
import Providers from "@/pages/Providers";
import ProviderInspector from "@/pages/ProviderInspector";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";

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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
