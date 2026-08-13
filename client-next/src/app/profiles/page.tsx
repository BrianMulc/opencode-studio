"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import axios from "axios";
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
import { Plus, Trash, Check, Edit, CardStack, Play, Copy, Download, Reload, Link } from "@nsmr/pixelart-react"
import { getProfiles, createProfile, deleteProfile, activateProfile, renameProfile, duplicateProfile, getProfilePresets, createProfileFromPreset, getLinkedProfiles, syncLinkedProfile, resetProfileToCatalog, type ProfileList, type ProfilePreset, type LinkedProfileInfo } from "@/lib/api";
import { PageHelp } from "@/components/page-help";

export default function ProfilesPage() {
  const t = useTranslations('profiles');
  const router = useRouter();
  const [data, setData] = useState<ProfileList | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [presets, setPresets] = useState<ProfilePreset[]>([]);
  const [presetOpen, setPresetOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetProfileName, setPresetProfileName] = useState("");
  const [creatingFromPreset, setCreatingFromPreset] = useState(false);
  const [linked, setLinked] = useState<Record<string, LinkedProfileInfo>>({});
  const [syncingProfile, setSyncingProfile] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renamingTarget, setRenamingTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [duplicatingTarget, setDuplicatingTarget] = useState<string | null>(null);
  const [duplicateValue, setDuplicateValue] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const getErrorMessage = (err: unknown) => {
    if (axios.isAxiosError(err)) return err.response?.data?.error || err.message;
    if (err instanceof Error) return err.message;
    return null;
  };

  const loadProfiles = async () => {
    try {
      const res = await getProfiles();
      setData(res);
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('loadFailedWithError', { error: msg }) : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadLinked = async () => {
    try {
      const res = await getLinkedProfiles();
      setLinked(res.linked);
    } catch {
      // Non-fatal: linked badges just won't show
    }
  };

  useEffect(() => {
    loadProfiles();
    loadLinked();
    getProfilePresets().then(res => setPresets(res.presets)).catch(() => {});
  }, []);

  const handleSync = async (name: string) => {
    try {
      setSyncingProfile(name);
      const result = await syncLinkedProfile(name);
      if (result.changed && result.overridesPreserved && result.overridesPreserved > 0) {
        toast.success(t('syncUpdatedWithOverrides', { name, count: result.overridesPreserved }));
      } else if (result.changed) {
        toast.success(t('syncUpdated', { name }));
      } else {
        toast.success(t('syncUpToDate', { name }));
      }
      loadProfiles();
      loadLinked();
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('syncFailedWithError', { error: msg }) : t('syncFailed'));
      loadLinked();
    } finally {
      setSyncingProfile(null);
    }
  };

  const handleResetToCatalog = async () => {
    if (!resetTarget) return;
    try {
      setResetting(true);
      await resetProfileToCatalog(resetTarget);
      toast.success(t('resetSuccess', { name: resetTarget }));
      setResetTarget(null);
      loadProfiles();
      loadLinked();
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('resetFailedWithError', { error: msg }) : t('resetFailed'));
    } finally {
      setResetting(false);
    }
  };

  const handleSelectPreset = (preset: ProfilePreset) => {
    setSelectedPresetId(preset.id);
    // Only auto-fill while the user hasn't typed a custom name
    if (!presetProfileName || presets.some(p => p.suggestedName === presetProfileName)) {
      setPresetProfileName(preset.suggestedName);
    }
  };

  const handleCreateFromPreset = async () => {
    if (!selectedPresetId) return;
    try {
      setCreatingFromPreset(true);
      const result = await createProfileFromPreset(selectedPresetId, presetProfileName);
      setPresetOpen(false);
      setSelectedPresetId(null);
      setPresetProfileName("");
      loadProfiles();
      loadLinked();
      if (result.warning) {
        // Catalog unreachable (off the tailnet?) — profile is created and
        // linked, first successful sync will fill it in.
        toast.warning(t('presetCreateSuccess', { name: result.name }), {
          description: result.warning,
          duration: 12000,
        });
      } else {
        // Presets ship without API keys — guide the user to add theirs.
        toast.success(t('presetCreateSuccess', { name: result.name }), {
          action: {
            label: t('presetSetApiKey'),
            onClick: () => router.push('/settings?section=providerKeys'),
          },
          duration: 10000,
        });
      }
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('presetCreateFailedWithError', { error: msg }) : t('presetCreateFailed'));
    } finally {
      setCreatingFromPreset(false);
    }
  };

  const handleCreate = async () => {
    if (!newProfileName.trim()) return;
    try {
      setCreating(true);
      await createProfile(newProfileName);
      toast.success(t('createSuccess', { name: newProfileName }));
      setCreateOpen(false);
      setNewProfileName("");
      loadProfiles();
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('createFailedWithError', { error: msg }) : t('createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProfile(deleteTarget);
      toast.success(t('deleted'));
      loadProfiles();
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('deleteFailedWithError', { error: msg }) : t('deleteFailed'));
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleActivate = async (name: string) => {
    try {
      setActivating(name);
      await activateProfile(name);
      toast.success(t('switchSuccess', { name }));
      loadProfiles();
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('switchFailedWithError', { error: msg }) : t('switchFailed'));
    } finally {
      setActivating(null);
    }
  };

  const handleRename = async () => {
    if (!renamingTarget || !renameValue.trim()) return;
    try {
      setRenaming(true);
      const result = await renameProfile(renamingTarget, renameValue.trim());
      toast.success(t('renameSuccess', { name: result.newName }));
      setRenamingTarget(null);
      setRenameValue("");
      loadProfiles();
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('renameFailedWithError', { error: msg }) : t('renameFailed'));
    } finally {
      setRenaming(false);
    }
  };

  const handleDuplicate = async () => {
    if (!duplicatingTarget) return;
    try {
      setDuplicating(true);
      const result = await duplicateProfile(duplicatingTarget, duplicateValue.trim() || undefined);
      toast.success(t('duplicateSuccess', { name: result.newName }));
      setDuplicatingTarget(null);
      setDuplicateValue("");
      loadProfiles();
    } catch (e) {
      const msg = getErrorMessage(e);
      toast.error(msg ? t('duplicateFailedWithError', { error: msg }) : t('duplicateFailed'));
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) {
    return <div className="p-8">{t('loading')}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12 p-8">
      <header className="flex justify-between items-end border-b pb-4">
        <div>
          <div className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <PageHelp
              title={t('title')}
              docUrl="https://opencode.ai/docs"
              docTitle={t('docTitle')}
            />
            <Badge variant="outline" className="font-mono text-xs font-normal">
              {data?.active ? t('activeProfile', { name: data.active }) : t('noActiveProfile')}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {t('description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {presets.length > 0 && (
            <Dialog open={presetOpen} onOpenChange={setPresetOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  {t('newFromPreset')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('presetDialogTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('presetDialogDescription')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  {presets.map((preset) => {
                    const selected = selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm">{preset.name}</span>
                          <Badge variant="outline" className="font-mono text-[10px] font-normal shrink-0">
                            <Link className="h-3 w-3 mr-1" />
                            {t('presetLinkedBadge')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                      </button>
                    );
                  })}
                  <div className="pt-2">
                    <Input
                      placeholder={t('namePlaceholder')}
                      value={presetProfileName}
                      onChange={(e) => setPresetProfileName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateFromPreset()}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5">{t('presetKeyHint')}</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPresetOpen(false)}>{t('cancel')}</Button>
                  <Button onClick={handleCreateFromPreset} disabled={!selectedPresetId || creatingFromPreset}>{t('create')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
<DialogTrigger asChild>
             <Button>
                <Plus className="h-4 w-4 mr-2" />
               {t('newProfile')}
              </Button>
            </DialogTrigger>
           <DialogContent>
             <DialogHeader>
               <DialogTitle>{t('createTitle')}</DialogTitle>
               <DialogDescription>
                 {t('createDescription')}
               </DialogDescription>
             </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder={t('namePlaceholder')}
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button>
                <Button onClick={handleCreate} disabled={!newProfileName.trim() || creating}>{t('create')}</Button>
              </DialogFooter>
            </DialogContent>
           </Dialog>
        </div>
        </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.profiles.map((profile) => {
          const isActive = data.active === profile;
          return (
            <Card key={profile} className={`hover-lift transition-all ${isActive ? 'border-primary shadow-md bg-primary/5' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-md ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <CardStack className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{profile}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-1">
                        {isActive && <Badge>{t('active')}</Badge>}
                        {linked[profile] && (
                          <Badge variant="outline" className="text-[10px] font-normal" title={linked[profile].configUrl}>
                            <Link className="h-3 w-3 mr-1" />
                            {t('linkedBadge')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-foreground h-8 w-8"
                      onClick={() => { setRenamingTarget(profile); setRenameValue(profile); }}
                      title={t('rename')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-foreground h-8 w-8"
                      onClick={() => { setDuplicatingTarget(profile); setDuplicateValue(""); }}
                      title={t('duplicate')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {profile !== 'default' && !isActive && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                        onClick={() => setDeleteTarget(profile)}
                        title={t('deleteBtn')}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {linked[profile] && (
                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={() => handleSync(profile)}
                    disabled={syncingProfile === profile}
                  >
                    <Reload className={`h-4 w-4 mr-2 ${syncingProfile === profile ? 'animate-spin' : ''}`} />
                    {syncingProfile === profile ? t('syncing') : t('syncNow')}
                  </Button>
                )}
                {isActive ? (
                  <Button disabled className="w-full" variant="secondary">
                     <Check className="h-4 w-4 mr-2" />
                    {t('current')}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handleActivate(profile)}
                    disabled={activating === profile}
                  >
                     <Play className="h-4 w-4 mr-2" />
                    {t('switch')}
                  </Button>
                )}
                {linked[profile] && (
                  <>
                    <p className="text-[11px] text-muted-foreground text-center">
                      {linked[profile].lastSyncStatus === 'error'
                        ? t('syncErrorNote')
                        : linked[profile].lastSyncedAt
                          ? t('lastSynced', { time: new Date(linked[profile].lastSyncedAt!).toLocaleString() })
                          : t('neverSynced')}
                    </p>
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                        onClick={() => setResetTarget(profile)}
                      >
                        {t('resetToCatalog')}
                      </button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription', { name: deleteTarget ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelBtn')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {t('deleteBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

<Dialog open={!!renamingTarget} onOpenChange={(open) => { if (!open) { setRenamingTarget(null); setRenameValue(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('renameTitle')}</DialogTitle>
            <DialogDescription>
              {t('renameDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder={t('renamePlaceholder')}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenamingTarget(null); setRenameValue(""); }}>{t('cancel')}</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim() || renaming}>{t('rename')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicatingTarget} onOpenChange={(open) => { if (!open) { setDuplicatingTarget(null); setDuplicateValue(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('duplicateTitle')}</DialogTitle>
            <DialogDescription>
              {t('duplicateDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder={t('duplicatePlaceholder')}
              value={duplicateValue}
              onChange={(e) => setDuplicateValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDuplicate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDuplicatingTarget(null); setDuplicateValue(""); }}>{t('cancel')}</Button>
            <Button onClick={handleDuplicate} disabled={duplicating}>{t('duplicate')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('resetDescription', { name: resetTarget ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>{t('cancelBtn')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetToCatalog} disabled={resetting}>
              {resetting ? t('resetting') : t('resetConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
