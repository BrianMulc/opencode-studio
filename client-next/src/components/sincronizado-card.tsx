"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Github, ExternalLink } from "@nsmr/pixelart-react";

export function SincronizadoCard() {
  const t = useTranslations("common");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Github className="h-5 w-5 text-primary" />
          <CardTitle>{t("sync.title")}</CardTitle>
        </div>
        <CardDescription>
          {t("sync.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted/30 rounded-lg space-y-2">
          <p className="text-sm">
            {t("sync.body")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild variant="outline" className="w-full">
            <a href="https://github.com/Microck/sincronizado" target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4 mr-2" />
              {t("sync.viewRepository")}
            </a>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <a href="https://sincronizado.micr.dev" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("sync.documentation")}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
