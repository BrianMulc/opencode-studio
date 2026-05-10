"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { WarningBox, Reload, Home } from "@nsmr/pixelart-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <WarningBox className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-medium">{t('title')}</h1>
        <p className="max-w-md text-muted-foreground">
          {t('description')}
        </p>
        {error.digest && (
          <code className="text-xs text-muted-foreground">
            {t('errorId')} {error.digest}
          </code>
        )}
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline" className="gap-2">
          <Reload className="h-4 w-4" />
          {t('tryAgain')}
        </Button>
        <Button asChild>
          <Link href="/" className="gap-2">
            <Home className="h-4 w-4" />
            {t('goHome')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
