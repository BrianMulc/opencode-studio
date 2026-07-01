"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useApp } from "@/lib/context";
import api, { getPaths, setConfigPath, getBackup, restoreBackup, getGitHubBackupStatus, backupToGitHub, restoreFromGitHub, setGitHubAutoSync, checkForUpdate, performUpdate, type PathsInfo, type BackupData, type UpdateCheckResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PermissionEditor } from "@/components/permission-editor";
import { Sliders as Settings, Android, Download, Upload, Save, ChevronDown, Loader, Code, Github, Reload } from "@nsmr/pixelart-react";
import { PageHelp } from "@/components/page-help";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import type { OpencodeConfig, GitHubBackupStatus } from "@/types";

const THEMES = ["dark", "light", "auto"] as const;
const SHARE_OPTIONS = ["manual", "auto", "disabled"] as const;

const ESSENTIAL_KEYBINDS = [
  ["leader", "Leader key"],
  ["app_exit", "Exit app"],
  ["session_new", "New session"],
  ["session_list", "List sessions"],
  ["session_interrupt", "Interrupt"],
  ["input_submit", "Submit input"],
  ["input_clear", "Clear input"],
  ["input_newline", "New line"],
  ["model_list", "Model selector"],
  ["agent_cycle", "Cycle agent"],
  ["messages_undo", "Undo"],
  ["messages_redo", "Redo"],
] as const;

export default function SettingsPage() {
  const t = useTranslations('settings');
  const { config, loading, saveConfig, refreshData } = useApp();
  const [pathsInfoBox, setPathsInfo] = useState<PathsInfo | null>(null);
  const [manualPath, setManualPath] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    general: true,
    permissions: false,
    advanced: false,
    prompts: false,
    backup: false,
    updates: false,
  });
  
const [systemPrompt, setSystemPrompt] = useState("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const { theme } = useTheme();

  const [ghBackupStatus, setGhBackupStatus] = useState<GitHubBackupStatus | null>(null);
  const [ghOwner, setGhOwner] = useState("");
  const [ghRepo, setGhRepo] = useState("opencode-backup");
  const [ghBranch, setGhBranch] = useState("main");
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);


  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    getPaths().then(setPathsInfo).catch(console.error);
    loadSystemPrompt();
    handleCheckUpdate(true); // silent - no toast, just populates the UI

    getGitHubBackupStatus().then(status => {
      setGhBackupStatus(status);
      if (status.config) {
        if (status.config.owner) setGhOwner(status.config.owner);
        if (status.config.repo) setGhRepo(status.config.repo);
        if (status.config.branch) setGhBranch(status.config.branch);
      }
      if (status.user && !status.config?.owner) setGhOwner(status.user);
    }).catch(console.error);
  }, []);

  const loadSystemPrompt = async () => {
    try {
      setLoadingPrompt(true);
      const res = await api.get('/prompts/global');
      setSystemPrompt(res.data.content);
    } catch (error) {
      console.error("Error loading prompt:", error);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleSaveSystemPrompt = async () => {
    try {
      setSavingPrompt(true);
      await api.post('/prompts/global', { content: systemPrompt });
      toast.success(t('toast.systemPromptUpdated'));
    } catch (error) {
      toast.error(t('toast.failedToSavePrompt'));
    } finally {
      setSavingPrompt(false);
    }
  };

  const updateConfig = async (updates: Partial<OpencodeConfig>) => {
    if (!config) return;
    try {
      await saveConfig({ ...config, ...updates });
      toast.success(t('toast.settingsSaved'));
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || t('unknownError');
      toast.error(t('toast.failedToSaveSettings', { msg }));
    }
  };

  const handleSetPath = async () => {
    try {
      await setConfigPath(manualPath || null);
      const newPaths = await getPaths();
      setPathsInfo(newPaths);
      await refreshData();
      toast.success(manualPath ? t('toast.configPathUpdated') : t('toast.resetToAutoDetect'));
      setManualPath("");
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || t('unknownError');
      toast.error(t('toast.failedToSetConfigPath', { msg }));
    }
  };

  const handleResetPath = async () => {
    try {
      await setConfigPath(null);
      const newPaths = await getPaths();
      setPathsInfo(newPaths);
      await refreshData();
      toast.success(t('toast.resetToAutoDetect'));
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || t('unknownError');
      toast.error(t('toast.failedToResetPath', { msg }));
    }
  };

  const handleBackup = async () => {
    try {
      const backup = await getBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `opencode-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('toast.backupDownloaded'));
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || t('unknownError');
      toast.error(t('toast.failedToCreateBackup', { msg }));
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const backup = JSON.parse(content) as BackupData;
      
      if (!backup.version || backup.version !== 1) {
        toast.error(t('toast.invalidBackupFormat'));
        return;
      }

      await restoreBackup(backup);
      await refreshData();
      toast.success(t('toast.backupRestored'));
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || t('unknownError');
      toast.error(t('toast.failedToRestoreBackup', { msg }));
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
 
  const handleGitHubBackup = async () => {
    if (!ghOwner || !ghRepo) {
      toast.error(t('toast.ownerAndRepoRequired'));
      return;
    }
    setBackingUp(true);
    try {
      const result = await backupToGitHub({ owner: ghOwner, repo: ghRepo, branch: ghBranch });
      if (result.success) {
        toast.success(t('toast.backupComplete', { url: result.url ?? '' }));
        const status = await getGitHubBackupStatus();
        setGhBackupStatus(status);
      } else {
        toast.error(result.error || t('toast.backupFailed'));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleGitHubRestore = async () => {
    if (!ghOwner || !ghRepo) {
      toast.error(t('toast.ownerAndRepoRequired'));
      return;
    }
    setRestoring(true);
    try {
      const result = await restoreFromGitHub({ owner: ghOwner, repo: ghRepo, branch: ghBranch });
      if (result.success) {
        toast.success(result.message);
        await refreshData();
      } else {
        toast.error(t('toast.restoreFailed'));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setRestoring(false);
    }
  };

  const handleToggleGitHubAutoSync = async (enabled: boolean) => {
    try {
      await setGitHubAutoSync(enabled);
      const status = await getGitHubBackupStatus();
      setGhBackupStatus(status);
      toast.success(enabled ? t('toast.autoSyncEnabled') : t('toast.autoSyncDisabled'));
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    }
  };

  const handleCheckUpdate = async (silent = false) => {
    setCheckingUpdate(true);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
      if (!silent) {
        if (info.updateAvailable) {
          toast.success(t('updates.available'));
        } else {
          toast.success(t('updates.upToDate'));
        }
      }
    } catch (err: any) {
      if (!silent) toast.error(err.response?.data?.error || err.message);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handlePerformUpdate = async () => {
    setUpdating(true);
    try {
      const result = await performUpdate();
      toast.success(result.message || t('updates.success'));
      // Server will shut down after update; user needs to restart
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <PageHelp title={t('pageTitle')} docUrl="https://opencode.ai/docs" docTitle={t('pageDocTitle')} />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHelp title={t('pageTitle')} docUrl="https://opencode.ai/docs" docTitle={t('pageDocTitle')} />

      <Collapsible open={openSections.general} onOpenChange={() => toggleSection("general")}>
        <Card className="hover-lift">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  <CardTitle>{t('general.title')}</CardTitle>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${openSections.general ? "rotate-180" : ""}`} />
              </div>
              <CardDescription>{t('general.description')}</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-scale-in">
            <CardContent className="space-y-6 pt-0">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>{t('general.theme')}</Label>
                  <Select
                    value={config?.theme || "dark"}
                    onValueChange={(v) => updateConfig({ theme: v as typeof THEMES[number] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEMES.map((theme) => (
                        <SelectItem key={theme} value={theme}>{theme}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('general.shareMode')}</Label>
                  <Select
                    value={config?.share || "manual"}
                    onValueChange={(v) => updateConfig({ share: v as typeof SHARE_OPTIONS[number] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHARE_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('general.defaultAgent')}</Label>
                  <Input
                    value={config?.default_agent || ""}
                    onChange={(e) => updateConfig({ default_agent: e.target.value || undefined })}
                    placeholder={t('general.defaultAgentPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('general.username')}</Label>
                  <Input
                    value={config?.username || ""}
                    onChange={(e) => updateConfig({ username: e.target.value || undefined })}
                    placeholder={t('general.usernamePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('general.smallModel')}</Label>
                  <Input
                    value={config?.small_model || ""}
                    onChange={(e) => updateConfig({ small_model: e.target.value || undefined })}
                    placeholder={t('general.smallModelPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-background rounded-lg">
                <div>
                  <Label>{t('general.autoUpdate')}</Label>
                  <p className="text-sm text-muted-foreground">{t('general.autoUpdateDescription')}</p>
                </div>
                <Switch
                  checked={config?.autoupdate === true}
                  onCheckedChange={(v) => updateConfig({ autoupdate: v })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-background rounded-lg">
                <div>
                  <Label>{t('general.snapshot')}</Label>
                  <p className="text-sm text-muted-foreground">{t('general.snapshotDescription')}</p>
                </div>
                <Switch
                  checked={config?.snapshot === true}
                  onCheckedChange={(v) => updateConfig({ snapshot: v })}
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={openSections.permissions} onOpenChange={() => toggleSection("permissions")}>
        <Card className="hover-lift">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  <CardTitle>{t('permissions.title')}</CardTitle>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${openSections.permissions ? "rotate-180" : ""}`} />
              </div>
              <CardDescription>{t('permissions.description')}</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-scale-in">
            <CardContent className="space-y-4 pt-0">
              <PermissionEditor
                value={config?.permission || {}}
                onChange={(next) => updateConfig({ permission: next })}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
 
      <Collapsible open={openSections.advanced} onOpenChange={() => toggleSection("advanced")}>
        <Card className="hover-lift">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  <CardTitle>{t('advanced.title')}</CardTitle>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${openSections.advanced ? "rotate-180" : ""}`} />
              </div>
              <CardDescription>{t('advanced.description')}</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-scale-in">
            <CardContent className="space-y-6 pt-0">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>{t('advanced.shell')}</Label>
                  <Input
                    value={config?.shell || ""}
                    onChange={(e) => updateConfig({ shell: e.target.value || undefined })}
                    placeholder={t('advanced.shellPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">{t('advanced.shellDescription')}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('advanced.disabledProviders')}</Label>
                  <Input
                    value={(config?.disabled_providers || []).join(", ")}
                    onChange={(e) => updateConfig({ disabled_providers: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                    placeholder={t('advanced.disabledProvidersPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">{t('advanced.disabledProvidersDescription')}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('advanced.enabledProviders')}</Label>
                  <Input
                    value={(config?.enabled_providers || []).join(", ")}
                    onChange={(e) => updateConfig({ enabled_providers: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
                    placeholder={t('advanced.enabledProvidersPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">{t('advanced.enabledProvidersDescription')}</p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label>{t('advanced.compactionTitle')}</Label>
                  <p className="text-sm text-muted-foreground mb-3">{t('advanced.compactionDescription')}</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                      <div>
                        <Label className="text-sm">{t('advanced.compactionAuto')}</Label>
                        <p className="text-xs text-muted-foreground">{t('advanced.compactionAutoDescription')}</p>
                      </div>
                      <Switch
                        checked={config?.compaction?.auto !== false}
                        onCheckedChange={(v) => updateConfig({ compaction: { ...config?.compaction, auto: v } })}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                      <div>
                        <Label className="text-sm">{t('advanced.compactionPrune')}</Label>
                        <p className="text-xs text-muted-foreground">{t('advanced.compactionPruneDescription')}</p>
                      </div>
                      <Switch
                        checked={config?.compaction?.prune === true}
                        onCheckedChange={(v) => updateConfig({ compaction: { ...config?.compaction, prune: v } })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">{t('advanced.compactionReserved')}</Label>
                      <Input
                        type="number"
                        value={config?.compaction?.reserved ?? ""}
                        onChange={(e) => updateConfig({ compaction: { ...config?.compaction, reserved: e.target.value ? Number(e.target.value) : undefined } })}
                        placeholder="10000"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label>{t('advanced.watcherIgnore')}</Label>
                <Textarea
                  className="min-h-[80px] font-mono text-xs resize-none"
                  value={(config?.watcher?.ignore || []).join("\n")}
                  onChange={(e) => updateConfig({ watcher: { ignore: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) } })}
                  placeholder={t('advanced.watcherIgnorePlaceholder')}
                />
                <p className="text-xs text-muted-foreground">{t('advanced.watcherIgnoreDescription')}</p>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label>{t('advanced.instructions')}</Label>
                <Textarea
                  className="min-h-[80px] font-mono text-xs resize-none"
                  value={(config?.instructions || []).join("\n")}
                  onChange={(e) => updateConfig({ instructions: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })}
                  placeholder={t('advanced.instructionsPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">{t('advanced.instructionsDescription')}</p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={openSections.prompts} onOpenChange={() => toggleSection("prompts")}>
        <Card className="hover-lift">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  <CardTitle>{t('systemPrompt.title')}</CardTitle>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${openSections.prompts ? "rotate-180" : ""}`} />
              </div>
              <CardDescription>{t('systemPrompt.description')}</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-scale-in">
            <CardContent className="space-y-4 pt-0">
              <div className="border rounded-md overflow-hidden h-[400px]">
                {loadingPrompt ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    defaultLanguage="markdown"
                    theme={theme === "dark" ? "vs-dark" : "light"}
                    value={systemPrompt}
                    onChange={(val) => setSystemPrompt(val || "")}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      padding: { top: 16 },
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                    }}
                  />
                )}
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveSystemPrompt} disabled={savingPrompt}>
                  {savingPrompt && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                  {t('systemPrompt.saveChanges')}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>



      <Collapsible open={openSections.updates} onOpenChange={() => toggleSection("updates")}>
        <Card className="hover-lift">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Reload className="h-5 w-5" />
                  <CardTitle>{t('updates.title')}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {updateInfo?.updateAvailable && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 font-medium">
                      {t('updates.badge')}
                    </span>
                  )}
                  <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${openSections.updates ? "rotate-180" : ""}`} />
                </div>
              </div>
              <CardDescription>{t('updates.description')}</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-scale-in">
            <CardContent className="space-y-4 pt-0">
              {checkingUpdate ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : updateInfo ? (
                <div className="space-y-4">
                  <div className="p-4 bg-background rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t('updates.currentVersion')}</span>
                      <span className="text-sm font-mono">v{updateInfo.version}</span>
                    </div>
                    {updateInfo.localHash && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('updates.localCommit')}</span>
                        <span className="text-sm font-mono">{updateInfo.localHash}</span>
                      </div>
                    )}
                    {updateInfo.remoteHash && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('updates.remoteCommit')}</span>
                        <span className="text-sm font-mono">{updateInfo.remoteHash}</span>
                      </div>
                    )}
                    {updateInfo.remoteVersion && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('updates.latestVersion')}</span>
                        <span className="text-sm font-mono">v{updateInfo.remoteVersion}</span>
                      </div>
                    )}
                    {updateInfo.remoteDate && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('updates.remoteDate')}</span>
                        <span className="text-sm">{new Date(updateInfo.remoteDate).toLocaleString()}</span>
                      </div>
                    )}
                    {updateInfo.remoteMessage && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t('updates.latestChange')}</span>
                        <span className="text-sm truncate max-w-[300px]">{updateInfo.remoteMessage}</span>
                      </div>
                    )}
                  </div>

                  {updateInfo.updateAvailable ? (
                    <div className="space-y-3">
                      <div className="p-4 bg-green-500/10 rounded-lg flex items-center gap-3">
                        <Reload className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="text-sm font-medium text-green-500">{t('updates.available')}</p>
                          <p className="text-xs text-muted-foreground">{t('updates.availableDescription')}</p>
                        </div>
                      </div>
                      <Button onClick={handlePerformUpdate} disabled={updating} className="w-full">
                        {updating ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        {updating ? t('updates.updating') : t('updates.updateNow')}
                      </Button>
                      {updating && (
                        <p className="text-xs text-muted-foreground text-center">{t('updates.updatingDescription')}</p>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/30 rounded-lg flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <p className="text-sm text-muted-foreground">{t('updates.upToDate')}</p>
                    </div>
                  )}

                  <Button variant="outline" onClick={handleCheckUpdate} disabled={checkingUpdate} className="w-full">
                    <Reload className="mr-2 h-4 w-4" />
                    {t('updates.checkAgain')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t('updates.notCheckedYet')}</p>
                  <Button variant="outline" onClick={handleCheckUpdate} disabled={checkingUpdate} className="w-full">
                    {checkingUpdate ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Reload className="mr-2 h-4 w-4" />}
                    {t('updates.checkNow')}
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={openSections.backup} onOpenChange={() => toggleSection("backup")}>
        <Card className="hover-lift">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Save className="h-5 w-5" />
                  <CardTitle>{t('backup.title')}</CardTitle>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${openSections.backup ? "rotate-180" : ""}`} />
              </div>
              <CardDescription>{t('backup.description')}</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent className="animate-scale-in">
            <CardContent className="space-y-6 pt-0">
              <div className="p-6 bg-background rounded-lg space-y-4">
                <div className="flex items-center gap-4">
                  <Download className="h-8 w-8 text-primary" />
                  <div>
                    <Label className="text-base">{t('backup.exportTitle')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('backup.exportDescription')}
                    </p>
                  </div>
                </div>
                <Button onClick={handleBackup} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  {t('backup.downloadBackup')}
                </Button>
              </div>

              <div className="p-6 bg-background rounded-lg space-y-4">
                <div className="flex items-center gap-4">
                  <Upload className="h-8 w-8 text-primary" />
                  <div>
                    <Label className="text-base">{t('backup.restoreTitle')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('backup.restoreDescription')}
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleRestore}
                  className="hidden"
                />
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('backup.selectBackupFile')}
                </Button>
<p className="text-xs text-muted-foreground text-center">
                  {t('backup.restoreWarning')}
                </p>
              </div>

              {/* GitHub Sync */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-4 mb-4">
                  <Github className="h-8 w-8 text-primary" />
                  <div>
                    <Label className="text-base">{t('backup.githubSync')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('backup.githubSyncDescription')}
                    </p>
                  </div>
                </div>
                
                {ghBackupStatus?.connected ? (
                  <>
                    <div className="p-4 bg-muted/30 rounded-lg space-y-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm">{t('backup.connectedAs', { user: ghBackupStatus.user ?? '' })}</span>
                      </div>
                      {ghBackupStatus.lastUpdated && (
                        <p className="text-xs text-muted-foreground">
                          {t('backup.lastSync', { date: new Date(ghBackupStatus.lastUpdated).toLocaleString() })}
                        </p>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="space-y-2">
                        <Label className="text-xs">{t('backup.owner')}</Label>
                        <Input value={ghOwner} onChange={(e) => setGhOwner(e.target.value)} placeholder="username" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">{t('backup.repository')}</Label>
                        <Input value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} placeholder="opencode-backup" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">{t('backup.branch')}</Label>
                        <Input value={ghBranch} onChange={(e) => setGhBranch(e.target.value)} placeholder="main" />
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg mb-4">
                      <div>
                        <Label>{t('backup.autoSync')}</Label>
                        <p className="text-xs text-muted-foreground">{t('backup.autoSyncDescription')}</p>
                      </div>
                      <Switch
                        checked={ghBackupStatus.autoSync || false}
                        onCheckedChange={handleToggleGitHubAutoSync}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <Button onClick={handleGitHubBackup} disabled={backingUp || restoring}>
                        {backingUp ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {backingUp ? t('backup.pushing') : t('backup.pushToGithub')}
                      </Button>
                      <Button variant="outline" onClick={handleGitHubRestore} disabled={backingUp || restoring}>
                        {restoring ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        {restoring ? t('backup.pulling') : t('backup.pullFromGithub')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      {t('backup.ghCliNotAuth')} <code className="bg-muted px-1 rounded">{t('backup.ghCliCommand')}</code> {t('backup.ghCliNotAuthAfter')}
                    </p>
                    {ghBackupStatus?.error && (
                      <p className="text-sm text-destructive mt-2">{ghBackupStatus.error}</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
       </Collapsible>

      <div className="pb-8" />
    </div>
  );
}
