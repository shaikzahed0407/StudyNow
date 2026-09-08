import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Notes from "./pages/Notes";
import Resources from "./pages/Resources";
import Ask from "./pages/Ask";
import Teacher from "./pages/Teacher";
import Admin from "./pages/Admin";
import StudyGroups from "./pages/StudyGroups";
import Profile from "./pages/Profile";

function WorkspaceRoute({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard"><WorkspaceRoute><Dashboard /></WorkspaceRoute></Route>
      <Route path="/notes"><WorkspaceRoute><Notes /></WorkspaceRoute></Route>
      <Route path="/groups"><WorkspaceRoute><StudyGroups /></WorkspaceRoute></Route>
      <Route path="/resources"><WorkspaceRoute><Resources /></WorkspaceRoute></Route>
      <Route path="/ask"><WorkspaceRoute><Ask /></WorkspaceRoute></Route>
      <Route path="/teacher"><WorkspaceRoute><Teacher /></WorkspaceRoute></Route>
      <Route path="/admin"><WorkspaceRoute><Admin /></WorkspaceRoute></Route>
      <Route path="/profile"><WorkspaceRoute><Profile /></WorkspaceRoute></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
