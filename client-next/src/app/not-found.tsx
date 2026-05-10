"use client";

import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "@nsmr/pixelart-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations('errors');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="text-8xl font-bold text-muted-foreground/20">404</div>
        <h1 className="text-2xl font-medium">{t('notFound.title')}</h1>
        <p className="max-w-md text-muted-foreground">
          {t('notFound.description')}
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild variant="outline" className="gap-2">
          <Link href="javascript:history.back()">
            <ArrowLeft className="h-4 w-4" />
            {t('notFound.goBack')}
          </Link>
        </Button>
        <Button asChild>
          <Link href="/" className="gap-2">
            <Home className="h-4 w-4" />
            {t('notFound.goHome')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
