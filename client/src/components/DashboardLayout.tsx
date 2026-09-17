import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ExternalLink,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Search,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { LoginModal } from "./LoginModal";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("studynow-sidebar-width");
    return saved ? parseInt(saved, 10) : 270;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem("studynow-sidebar-width", sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4 py-8">
        <LoginModal isEmbedded showBackButton />
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent user={user} setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  user,
  children,
  setSidebarWidth,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const isResizing = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();

  const utils = trpc.useUtils();

  // Multi-account list
  const { data: accountsList } = trpc.auth.listAccounts.useQuery(undefined, {
    staleTime: 30_000,
  });

  // Account switch mutation
  const switchMutation = trpc.auth.switchAccount.useMutation({
    onSuccess: async (data) => {
      if (data.token) {
        try {
          sessionStorage.setItem("studynow-token", data.token);
        } catch {}
      }
      await utils.auth.me.invalidate();
      await utils.auth.listAccounts.invalidate();
      toast.success(`Switched account to ${data.user?.name || "User"}`);
      window.location.reload();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to switch account");
    },
  });

  // Notifications
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 20_000,
  });
  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.isRead),
    [notifications]
  );

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
    },
  });

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
    },
  });

  const currentRole = user.role || "student";

  const navItems = useMemo(() => {
    const base = [
      { icon: LayoutDashboard, label: "Overview", path: "/dashboard" },
      { icon: FileText, label: "My Notes", path: "/notes" },
      { icon: Users, label: "Study Groups", path: "/groups" },
      { icon: Search, label: "Ask AI", path: "/ask" },
    ];

    if (currentRole === "teacher" || currentRole === "admin") {
      base.push({
        icon: GraduationCap,
        label: "Teacher Portal",
        path: "/teacher",
      });
    }

    if (currentRole === "admin") {
      base.push({
        icon: ShieldCheck,
        label: "Platform Admin",
        path: "/admin",
      });
    }

    base.push({
      icon: User,
      label: "My Profile",
      path: "/profile",
    });

    return base;
  }, [currentRole]);

  const active = navItems.find((item) => location === item.path) || navItems[0];

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing.current || !sidebarRef.current || isCollapsed) return;
      const width = event.clientX - sidebarRef.current.getBoundingClientRect().left;
      if (width >= 220 && width <= 360) setSidebarWidth(width);
    };
    const up = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [isCollapsed, setSidebarWidth]);

  return (
    <>
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar/90">
          <SidebarHeader className={`h-[76px] justify-center border-b border-sidebar-border/70 ${isCollapsed ? "px-0 items-center" : "px-3"}`}>
            <div className={`flex items-center ${isCollapsed ? "justify-center w-full" : "gap-3"}`}>
              <button
                onClick={toggleSidebar}
                className={`grid ${isCollapsed ? "size-8" : "size-9"} shrink-0 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lift focus-visible:ring-2 focus-visible:ring-ring`}
                aria-label="Toggle navigation"
              >
                <PanelLeft className="size-4" />
              </button>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="font-display text-[15px] font-extrabold tracking-tight">StudyNow</p>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Personal & Group Study
                  </p>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="px-3 py-4">
            {!isCollapsed && (
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Workspace
              </p>
            )}
            <SidebarMenu className="gap-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={location === item.path}
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className="h-11 rounded-xl font-semibold"
                  >
                    <item.icon className="size-[18px]" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>

          {/* Sidebar Footer: Discord-Style Multi-Account Switcher */}
          <SidebarFooter className={`border-t border-sidebar-border/70 ${isCollapsed ? "p-1.5 justify-center items-center" : "p-3"}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex w-full items-center rounded-xl transition hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring group ${
                    isCollapsed ? "justify-center p-1" : "gap-3 p-2 text-left"
                  }`}
                  aria-label="Account options"
                >
                  <Avatar className={`${isCollapsed ? "size-8" : "size-9"} border border-sidebar-border shrink-0`}>
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || "Avatar"} />}
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                      {user.name?.slice(0, 1).toUpperCase() || "S"}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-bold">{user.name || "StudyNow user"}</p>
                        </div>
                        <p className="truncate text-xs capitalize text-muted-foreground">
                          {user.role}
                        </p>
                      </div>
                      <ChevronsUpDown className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-72 p-2 rounded-2xl shadow-xl">
                <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Active Account
                </DropdownMenuLabel>
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/60 mb-2">
                  <Avatar className="size-9">
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                    <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                      {user.name?.slice(0, 1).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email || "No email"}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize text-[10px] py-0 px-2 font-semibold">
                    {user.role}
                  </Badge>
                </div>

                {/* Discord-style Switch Accounts Section */}
                {accountsList && accountsList.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      Switch Connected Account
                    </DropdownMenuLabel>
                    <div className="space-y-1 my-1">
                      {accountsList.map((acc) => {
                        const isCurrent = acc.openId === user.openId;
                        return (
                          <button
                            key={acc.openId}
                            onClick={() => {
                              if (!isCurrent && !switchMutation.isPending) {
                                switchMutation.mutate({ openId: acc.openId });
                              }
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm transition ${
                              isCurrent
                                ? "bg-primary/10 text-primary font-bold"
                                : "hover:bg-muted text-foreground"
                            }`}
                          >
                            <Avatar className="size-7">
                              {acc.avatarUrl && <AvatarImage src={acc.avatarUrl} />}
                              <AvatarFallback className="text-[10px] font-bold">
                                {acc.name?.slice(0, 1).toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate">{acc.name}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{acc.role}</p>
                            </div>
                            {isCurrent && <Check className="size-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="gap-2.5 rounded-xl cursor-pointer py-2 text-destructive focus:text-destructive font-medium"
                  onClick={logout}
                >
                  <LogOut className="size-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize hover:bg-primary/20 ${
            isCollapsed ? "hidden" : ""
          }`}
          onMouseDown={() => {
            isResizing.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
        />
      </div>

      <SidebarInset className="min-w-0 bg-background flex flex-col min-h-screen">
        {/* Top Header Bar for Notifications & Context */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/70 bg-background/80 px-4 sm:px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            {isMobile && <SidebarTrigger className="size-9 rounded-xl" />}
            <span className="font-display text-sm font-extrabold tracking-tight">
              {active?.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification Center */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative size-9 rounded-xl text-muted-foreground hover:text-foreground"
                  aria-label="Notifications"
                >
                  <Bell className="size-4" />
                  {unreadNotifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex size-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coral opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-2.5 bg-coral"></span>
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 sm:w-96 p-0 rounded-2xl shadow-xl">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h4 className="font-display text-sm font-extrabold">Notifications</h4>
                    {unreadNotifications.length > 0 && (
                      <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">
                        {unreadNotifications.length} new
                      </Badge>
                    )}
                  </div>
                  {unreadNotifications.length > 0 && (
                    <button
                      onClick={() => markAllReadMutation.mutate()}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <ScrollArea className="max-h-[350px]">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No notifications yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (!n.isRead) markReadMutation.mutate({ notificationId: n.id });
                            if (n.linkUrl) setLocation(n.linkUrl);
                          }}
                          className={`p-3 sm:p-4 text-left cursor-pointer transition flex items-start gap-3 hover:bg-muted/50 ${
                            !n.isRead ? "bg-primary/5" : ""
                          }`}
                        >
                          <div
                            className={`mt-0.5 size-2 rounded-full shrink-0 ${
                              !n.isRead ? "bg-primary" : "bg-transparent"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-foreground">{n.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {n.message}
                            </p>
                            <p className="text-[10px] text-muted-foreground/70 mt-1">
                              {new Date(n.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8 lg:px-12">{children}</main>
      </SidebarInset>
    </>
  );
}
