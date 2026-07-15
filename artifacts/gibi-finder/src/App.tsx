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
      <Route path="/explorar" component={Explore} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
