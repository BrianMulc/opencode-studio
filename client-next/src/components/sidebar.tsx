"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Server, Gamepad, Code, Sliders, File, Command, Forward, Circle, Play, Power, CardStack, List, Reload } from "@nsmr/pixelart-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

import { useApp } from "@/lib/context";
import { PROTOCOL_URL, shutdownBackend, checkForUpdate, type UpdateCheckResult } from "@/lib/api";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const navItems = [
  { href: "/profiles", label: "nav.profiles", icon: CardStack },
  { href: "/agents", label: "nav.agents", icon: List },
  { href: "/mcp", label: "nav.mcpServers", icon: Server },
  { href: "/skills", label: "nav.skills", icon: Gamepad },
  { href: "/plugins", label: "nav.plugins", icon: Code },
  { href: "/commands", label: "nav.commands", icon: Command },
  { href: "/logs", label: "nav.logs", icon: File },
  { href: "/rules", label: "nav.rules", icon: Sliders },
  { href: "/settings/code", label: "nav.codeSettings", icon: Code },
  { href: "/settings", label: "nav.settings", icon: Sliders },
  { href: "/config", label: "nav.rawConfig", icon: File },
];

const bottomNavItems = [
  { href: "/quickstart", label: "nav.quickstart", icon: Forward },
];

export function Sidebar() {
  const pathname = usePathname();
  const { connected } = useApp();
  const t = useTranslations('sidebar');
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Silent check for updates on sidebar mount
    checkForUpdate().then(info => setUpdateAvailable(info.updateAvailable)).catch(() => {});
    // Re-check every 10 minutes
    const interval = setInterval(() => {
      checkForUpdate().then(info => setUpdateAvailable(info.updateAvailable)).catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLaunchBackend = () => {
    window.location.href = PROTOCOL_URL;
  };

  const handleDisconnect = async () => {
    await shutdownBackend();
    setShowDisconnectDialog(false);
  };

  return (
    <TooltipProvider>
      <div className="w-64 bg-background flex flex-col h-screen" style={{ borderRight: '1px solid var(--oc-border-weak)' }}>
        <div className="p-6 flex items-center gap-3" style={{ borderBottom: '1px solid var(--oc-border-weak)' }}>
          <Logo className="w-6 h-6" />
          <img src="/OpencodeStudioText.png" alt="OpenCode Studio" className="h-6 w-auto" />
        </div>

        <nav className="flex-1 py-4 space-y-0.5">
          {navItems.map((item) => {
            const isActive = (() => {
              if (pathname === item.href) return true;
              if (!pathname.startsWith(`${item.href}/`)) return false;
              // Check if a more specific nav item matches instead
              const hasMoreSpecificMatch = navItems.some(
                (other) => other.href !== item.href && other.href.startsWith(`${item.href}/`) && (pathname === other.href || pathname.startsWith(`${other.href}/`))
              );
              return !hasMoreSpecificMatch;
            })();
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 rounded-none px-6 h-9",
                      isActive 
                        ? "font-medium" 
                        : "font-normal"
                    )}
                    style={isActive ? {
                      borderLeft: '2px solid var(--oc-background-strong)',
                      background: 'var(--oc-background-weak)',
                      color: 'var(--oc-text-strong)',
                    } : {
                      borderLeft: '2px solid transparent',
                      color: 'var(--oc-text)',
                    }}
                    asChild
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" style={{ color: isActive ? 'var(--oc-text-strong)' : 'var(--oc-icon)' }} />
                      <span className="text-sm">{t(item.label)}</span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{t(item.label)}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="py-4 space-y-0.5">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-3 rounded-none px-6 h-9",
                      isActive 
                        ? "font-medium" 
                        : "font-normal"
                    )}
                    style={isActive ? {
                      borderLeft: '2px solid var(--oc-background-strong)',
                      background: 'var(--oc-background-weak)',
                      color: 'var(--oc-text-strong)',
                    } : {
                      borderLeft: '2px solid transparent',
                      color: 'var(--oc-text)',
                    }}
                    asChild
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" style={{ color: isActive ? 'var(--oc-text-strong)' : 'var(--oc-icon)' }} />
                      <span className="text-sm">{t(item.label)}</span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{t(item.label)}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
          {updateAvailable && (
            <Link href="/settings" className="block mx-4 mt-3">
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] cursor-pointer"
                style={{
                  background: 'color-mix(in srgb, var(--oc-primary, #6366f1) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--oc-primary, #6366f1) 40%, transparent)',
                  color: 'var(--oc-primary, #6366f1)',
                }}
              >
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--oc-primary, #6366f1)' }} />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: 'var(--oc-primary, #6366f1)' }} />
                </span>
                <span className="flex-1">{t('updateBadge')}</span>
                <Reload className="h-3.5 w-3.5 flex-shrink-0" />
              </div>
            </Link>
          )}
        </div>

        <div className="p-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--oc-border-weak)' }}>
          <div className="flex items-center gap-2">
            <Circle className={cn("h-2 w-2 fill-current", connected ? "text-green-500" : "text-red-500")} />
            <span className="text-xs text-muted-foreground">
              {connected ? t('status.connected') : t('status.disconnected')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!connected && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleLaunchBackend}>
                    <Play className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('tooltips.launchBackend')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {connected && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setShowDisconnectDialog(true)}>
                    <Power className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('tooltips.disconnectBackend')}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <ThemeToggle />
          </div>
        </div>

        <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('disconnectDialog.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('disconnectDialog.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('disconnectDialog.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDisconnect}>{t('disconnectDialog.disconnect')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
