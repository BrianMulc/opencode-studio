"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { Plus, Trash, CardStack, Download, Copy, ArrowRight } from "@nsmr/pixelart-react"
import { getCustomHarnessProfiles, createCustomHarnessProfile, deleteCustomHarnessProfile, type CustomHarnessProfileList } from "@/lib/api";
import { PageHelp } from "@/components/page-help";

export default function CustomHarnessPage() {
  const t = useTranslations('customHarness');
  const [data, setData] = useState<CustomHarnessProfileList | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createSource, setCreateSource] = useState<'latest' | 'copy-existing'>('latest');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const getErrorMessage = (err: unknown) => {
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      if (axiosErr.response?.data?.error) {
        return axiosErr.response.data.error;
      }
    }
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return t('unknownError');
  };

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const result = await getCustomHarnessProfiles();
      setData(result);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleCreate = async () => {
    if (!newProfileName.trim()) {
      toast.error(t('nameRequired'));
      return;
    }
    try {
      setCreating(true);
      await createCustomHarnessProfile(newProfileName.trim(), createSource);
      toast.success(t('created'));
      setNewProfileName("");
      setCreateOpen(false);
      await fetchProfiles();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteCustomHarnessProfile(deleteTarget);
      toast.success(t('deleted'));
      setDeleteTarget(null);
      await fetchProfiles();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <PageHelp title={t('title')} docUrl="https://github.com/code-yeongyu/oh-my-openagent" docTitle={t('title')} />
      </div>

      <div className="flex items-center gap-4">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t('createNew')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('createNew')}</DialogTitle>
              <DialogDescription>{t('createDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('profileName')}</label>
                <Input
                  placeholder={t('profileNamePlaceholder')}
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('source')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateSource('latest')}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors ${
                      createSource === 'latest'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <Download className="h-6 w-6" />
                    <span className="text-sm font-medium">{t('installLatest')}</span>
                    <span className="text-xs text-muted-foreground">{t('installLatestDesc')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateSource('copy-existing')}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors ${
                      createSource === 'copy-existing'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <Copy className="h-6 w-6" />
                    <span className="text-sm font-medium">{t('copyExisting')}</span>
                    <span className="text-xs text-muted-foreground">{t('copyExistingDesc')}</span>
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                {t('cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newProfileName.trim()}>
                {creating ? t('creating') : t('create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-20" />
            </Card>
          ))}
        </div>
      ) : data?.profiles && data.profiles.length > 0 ? (
        <div className="grid gap-4">
          {data.profiles.map((profile) => (
            <Card key={profile.name} className="group hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Link href={`/custom-harness/${profile.name}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <CardStack className="h-5 w-5 text-muted-foreground" />
                    <div className="min-w-0">
                      <CardTitle className="text-base group-hover:text-primary transition-colors">{profile.name}</CardTitle>
                      <CardDescription>
                        {profile.createdAt
                          ? new Date(profile.createdAt).toLocaleDateString()
                          : t('unknownDate')}
                        {profile.source && (
                          <Badge variant="outline" className="ml-2">
                            {profile.source === 'latest' ? t('sourceLatest') : t('sourceCopy')}
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    {profile.hasSource && (
                      <Badge variant="secondary">{t('hasSource')}</Badge>
                    )}
                    {profile.hasConfig && (
                      <Badge variant="secondary">{t('hasConfig')}</Badge>
                    )}
                    <Link href={`/custom-harness/${profile.name}`}>
                      <Button variant="ghost" size="sm" className="gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {t('open')}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(profile.name);
                      }}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CardStack className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">{t('noProfiles')}</p>
          <Button variant="outline" className="mt-4" onClick={() => setCreateOpen(true)}>
            {t('createFirst')}
          </Button>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription', { name: deleteTarget || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
