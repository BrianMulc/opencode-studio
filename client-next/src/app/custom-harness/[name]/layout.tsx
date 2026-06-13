"use client";

import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ToggleLeft, Sliders, File, Command, Power, Server, ChartBar, Code } from "@nsmr/pixelart-react";
import { ReloadProvider, ReloadBanner } from "@/components/reload-context";

const navItems = [
  { href: "", label: "dashboard", icon: ChartBar },
  { href: "/features", label: "features", icon: ToggleLeft },
  { href: "/hooks", label: "hooks", icon: Power },
  { href: "/categories", label: "categories", icon: Sliders },
  { href: "/agents", label: "agents", icon: Server },
  { href: "/modes", label: "modes", icon: File },
  { href: "/delegation", label: "delegation", icon: Command },
  { href: "/source", label: "source", icon: Code },
];

export default function HarnessLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const basePath = `/custom-harness/${name}`;

  return (
    <ReloadProvider>
    <div className="space-y-6">
      <ReloadBanner />
      <div className="flex items-center gap-4">
        <Link href="/custom-harness">
          <Button variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('backToManager')}
          </Button>
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {name}
        </h1>
      </div>

      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        {navItems.map((item) => {
          const href = `${basePath}${item.href}`;
          const isActive = pathname === href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn("gap-2", isActive && "font-medium")}
              >
                <Icon className="h-4 w-4" />
                {t(item.label)}
              </Button>
            </Link>
          );
        })}
      </div>

      {children}
    </div>
    </ReloadProvider>
  );
}
