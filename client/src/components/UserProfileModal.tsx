import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Globe, Link2, Linkedin, Loader2, User } from "lucide-react";

interface UserProfileModalProps {
  userId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserProfileModal({ userId, open, onOpenChange }: UserProfileModalProps) {
  const { data: user, isLoading } = trpc.profiles.getPublicProfile.useQuery(
    { userId: userId! },
    { enabled: open && userId !== null }
  );

  let parsedLinks: { website?: string; github?: string; linkedin?: string } = {};
  if (user?.externalLinks) {
    try {
      parsedLinks = JSON.parse(user.externalLinks);
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-border/80 shadow-2xl">
        <div className="h-24 bg-gradient-to-r from-primary/30 via-primary/10 to-accent/30" />

        <div className="px-6 pb-6 pt-0 text-center">
          <div className="-mt-12 mb-3 flex justify-center">
            <Avatar className="size-24 border-4 border-card shadow-soft">
              {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name || "User"} /> : null}
              <AvatarFallback className="bg-primary/15 text-2xl font-black text-primary">
                {user?.name?.slice(0, 1).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </div>

          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : user ? (
            <div className="space-y-4">
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {user.name || "StudyNow Member"}
                </DialogTitle>
                <div className="mt-2 flex justify-center gap-2">
                  <Badge variant="secondary" className="capitalize font-bold text-xs">
                    {user.role}
                  </Badge>
                </div>
              </div>

              {user.bio ? (
                <div className="text-left bg-muted/40 p-3.5 rounded-2xl border border-border/50 text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                  {user.bio}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground/60">
                  This user hasn't added a bio yet.
                </p>
              )}

              {(parsedLinks.website || parsedLinks.github || parsedLinks.linkedin) && (
                <div className="flex justify-center gap-4 pt-2 border-t border-border/50 text-muted-foreground">
                  {parsedLinks.website && (
                    <a
                      href={
                        parsedLinks.website.startsWith("http")
                          ? parsedLinks.website
                          : `https://${parsedLinks.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs hover:text-primary transition-colors"
                    >
                      <Globe className="size-3.5" /> Website
                    </a>
                  )}
                  {parsedLinks.github && (
                    <a
                      href={
                        parsedLinks.github.startsWith("http")
                          ? parsedLinks.github
                          : `https://github.com/${parsedLinks.github.replace(/^@/, "")}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs hover:text-primary transition-colors"
                    >
                      <Link2 className="size-3.5" /> GitHub
                    </a>
                  )}
                  {parsedLinks.linkedin && (
                    <a
                      href={
                        parsedLinks.linkedin.startsWith("http")
                          ? parsedLinks.linkedin
                          : `https://linkedin.com/in/${parsedLinks.linkedin}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs hover:text-primary transition-colors"
                    >
                      <Linkedin className="size-3.5" /> LinkedIn
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">User not found</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
