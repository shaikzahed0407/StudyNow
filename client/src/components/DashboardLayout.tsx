import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { LoginModal } from "./LoginModal";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BookOpen,
  Boxes,
  FileText,
  LayoutDashboard,
  Library,
  LogOut,
  PanelLeft,
  Search,
  ShieldCheck,
  UploadCloud,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const roleName = (value?: string | null) => (value === "user" ? "student" : value || "student");

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("studynow-sidebar-width");
    return saved ? parseInt(saved, 10) : 260;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem("studynow-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-6">
        <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
        <div className="max-w-md rounded-3xl border border-border/70 bg-card p-10 text-center shadow-soft">
          <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <BookOpen className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Your notes, in reach.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Sign in to enter your StudyNow workspace.
          </p>
          <Button className="mt-7 w-full rounded-xl font-bold shadow-lift" onClick={() => setLoginOpen(true)}>
            Sign in to StudyNow
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent user={user} setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ user, children, setSidebarWidth }: { user: NonNullable<ReturnType<typeof useAuth>["user"]>; children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const isResizing = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();
  const currentRole = roleName(user.role);
  const navItems = useMemo(() => {
    const base = [
      { icon: LayoutDashboard, label: "Overview", path: "/dashboard" },
      { icon: FileText, label: "My notes", path: "/notes" },
      { icon: Users, label: "Study groups", path: "/groups" },
    ];
    if (currentRole === "student" || currentRole === "admin") {
      base.push(
        { icon: Library, label: "Class library", path: "/resources" },
        { icon: Search, label: "Ask your notes", path: "/ask" }
      );
    }
    if (currentRole === "teacher" || currentRole === "admin") {
      base.push({ icon: UploadCloud, label: "Teacher portal", path: "/teacher" });
    }
    if (currentRole === "admin") {
      base.push(
        { icon: ShieldCheck, label: "Admin workspace", path: "/admin" },
        { icon: Boxes, label: "Subjects & classes", path: "/admin/classes" }
      );
    }
    return base;
  }, [currentRole]);

  const active = navItems.find(item => location === item.path) || navItems[0];

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing.current || !sidebarRef.current || isCollapsed) return;
      const width = event.clientX - sidebarRef.current.getBoundingClientRect().left;
      if (width >= 220 && width <= 360) setSidebarWidth(width);
    };
    const up = () => { isResizing.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [isCollapsed, setSidebarWidth]);

  return (
    <>
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar/90">
          <SidebarHeader className="h-[76px] justify-center border-b border-sidebar-border/70 px-3">
            <div className="flex items-center gap-3">
              <button onClick={toggleSidebar} className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lift focus-visible:ring-2 focus-visible:ring-ring" aria-label="Toggle navigation"><PanelLeft className="size-4" /></button>
              {!isCollapsed && <div className="min-w-0"><p className="font-display text-[15px] font-extrabold tracking-tight">StudyNow</p><p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Knowledge workspace</p></div>}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 py-5">
            {!isCollapsed && <p className="px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Workspace</p>}
            <SidebarMenu className="gap-1">
              {navItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl font-semibold"><item.icon className="size-[18px]" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
            </SidebarMenu>
            {!isCollapsed && <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-4"><p className="text-xs font-bold">Keep your evidence close.</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Answers stay grounded in notes you’re allowed to access.</p></div>}
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border/70 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"><Avatar className="size-9 border border-sidebar-border"><AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{user.name?.slice(0, 1).toUpperCase() || "S"}</AvatarFallback></Avatar>{!isCollapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{user.name || "StudyNow user"}</p><p className="truncate text-xs capitalize text-muted-foreground">{currentRole} portal</p></div>}</button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel>Account</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem className="gap-2" onClick={logout}><LogOut className="size-4" /> Sign out</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize hover:bg-primary/20 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => { isResizing.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }} />
      </div>
      <SidebarInset className="min-w-0 bg-background">
        {isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border/70 bg-background/90 px-3 backdrop-blur"><SidebarTrigger className="size-9 rounded-xl" /><span className="font-display text-sm font-extrabold">{active?.label}</span></div>}
        <main className="min-h-screen px-4 py-5 sm:px-7 sm:py-7 lg:px-10">{children}</main>
      </SidebarInset>
    </>
  );
}
