"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { getCustomHarnessProfile } from "@/lib/api";
import { toast } from "sonner";

export default function HarnessDashboardPage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getCustomHarnessProfile(name);
        setProfile(data.profile);
      } catch (err) {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">{t('notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t('dashboardTitle')}</h2>
        <p className="text-muted-foreground">{t('dashboardDescription')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('profileInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('name')}</span>
              <span className="font-medium">{profile.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('source')}</span>
              <Badge variant="outline">
                {profile.source === 'latest' ? t('sourceLatest') : t('sourceCopy')}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('created')}</span>
              <span>{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : t('unknownDate')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('hasSource')}</span>
              <Badge variant={profile.hasSource ? "default" : "secondary"}>
                {profile.hasSource ? t('yes') : t('no')}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('hasConfig')}</span>
              <Badge variant={profile.hasConfig ? "default" : "secondary"}>
                {profile.hasConfig ? t('yes') : t('no')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('quickActionsDescription')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
