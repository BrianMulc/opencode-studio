"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Editor } from "@monaco-editor/react";
import { toast } from "sonner";
import type { AgentConfig, AgentInfo, PermissionConfig } from "@/types";
import { getAgents, saveAgent, deleteAgent, toggleAgent } from "@/lib/api";
import { useErrorTranslation } from "@/lib/error-translate";
import { cn } from "@/lib/utils";
import { AgentCard } from "@/components/agent-card";
import { PermissionEditor } from "@/components/permission-editor";
import { PageHelp } from "@/components/page-help";
import { PageHelpDialog } from "@/components/page-help-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Plus } from "@nsmr/pixelart-react";

const TOOL_OPTIONS = [
  "read",
  "edit",
  "bash",
  "glob",
  "grep",
  "list",
  "task",
  "skill",
  "lsp",
  "todoread",
  "todowrite",
  "webfetch",
  "websearch",
];

const THEME_COLOR_PREVIEW: Record<string, string> = {
  primary: "#3b82f6",
  secondary: "#6b7280",
  accent: "#8b5cf6",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
};

const MODES: Array<AgentConfig["mode"]> = ["primary", "subagent", "all"];

function deriveToolsFromPermission(permission: PermissionConfig | undefined, toolOptions: string[]): Record<string, boolean> {
  if (!permission) return {};
  const wildcard = permission["*"];
  const tools: Record<string, boolean> = {};
  for (const tool of toolOptions) {
    const perm = permission[tool as keyof PermissionConfig];
    if (perm === "allow") {
      tools[tool] = true;
    } else if (perm === "deny") {
      tools[tool] = false;
    } else if (wildcard === "allow") {
      tools[tool] = true;
    } else {
      tools[tool] = false;
    }
  }
  return tools;
}

interface AgentFormState {
  name: string;
  description: string;
  mode: AgentConfig["mode"];
  model: string;
  temperature: number;
  top_p: number;
  color: string;
  prompt: string;
  tools: Record<string, boolean>;
  permission: PermissionConfig;
  steps?: number;
  disable?: boolean;
  hidden?: boolean;
  source: "markdown" | "json";
  scope: "global" | "project";
}

const emptyForm = (): AgentFormState => ({
  name: "",
  description: "",
  mode: "subagent",
  model: "",
  temperature: 0.3,
  top_p: 0,
  color: "",
  prompt: "",
  tools: {},
  permission: { "*": "ask" },
  steps: undefined,
  disable: false,
  hidden: false,
  source: "markdown",
  scope: "global",
});

export default function AgentsPage() {
  const t = useTranslations('agents');
  const translateError = useErrorTranslation();
  const { theme } = useTheme();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AgentInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AgentFormState>(emptyForm());
  const [helpOpen, setHelpOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentInfo | null>(null);

  const filteredAgents = useMemo(() => agents, [agents]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const data = await getAgents();
      setAgents(data);
    } catch (err: any) {
      toast.error(translateError(err, t('loadFailed')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const openEditor = (agent?: AgentInfo) => {
    if (!agent) {
      setEditing(null);
      setForm(emptyForm());
      setOpen(true);
      return;
    }

    setEditing(agent);
    setForm({
      name: agent.name,
      description: agent.description || "",
      mode: agent.mode || "subagent",
      model: agent.model || "",
      temperature: agent.temperature ?? 0.3,
      top_p: agent.top_p ?? 0,
      color: agent.color || "",
      prompt: agent.prompt || "",
      tools: agent.tools && Object.keys(agent.tools).length > 0
        ? agent.tools
        : deriveToolsFromPermission(agent.permission || agent.permissions, TOOL_OPTIONS),
      permission: agent.permission || agent.permissions || { "*": "ask" },
      steps: agent.steps ?? agent.maxSteps,
      disable: agent.disable,
      hidden: agent.hidden,
      source: agent.source === "json" ? "json" : "markdown",
      scope: "global",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }

    const payload: AgentConfig = {
      description: form.description || undefined,
      mode: form.mode || "subagent",
      model: form.model || undefined,
      temperature: form.temperature,
      top_p: form.top_p || undefined,
      color: form.color || undefined,
      prompt: form.prompt || "",
      permission: form.permission,
      steps: form.steps,
      disable: form.disable,
      hidden: form.hidden,
    };

    try {
      await saveAgent(editing?.name || form.name.trim(), payload, form.source, form.scope);
      toast.success(editing ? t('updated') : t('created'));
      setOpen(false);
      setEditing(null);
      loadAgents();
    } catch (err: any) {
      toast.error(translateError(err, t('saveFailed')));
    }
  };

  const handleDelete = async (agent: AgentInfo) => {
    setDeleteTarget(agent);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAgent(deleteTarget.name);
      toast.success(t('deleted'));
      loadAgents();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || t('deleteFailed');
      toast.error(msg);
    }
    setDeleteDialogOpen(false);
  };

  const handleToggle = async (agent: AgentInfo) => {
    try {
      await toggleAgent(agent.name);
      loadAgents();
    } catch (err: any) {
      toast.error(translateError(err, t('toggleFailed')));
    }
  };

  const handleDuplicate = (agent: AgentInfo) => {
    setEditing(null);
    setForm({
      name: `${agent.name}-copy`,
      description: agent.description || "",
      mode: agent.mode || "subagent",
      model: agent.model || "",
      temperature: agent.temperature ?? 0.3,
      top_p: agent.top_p ?? 0,
      color: agent.color || "",
      prompt: agent.prompt || "",
      tools: agent.tools && Object.keys(agent.tools).length > 0
        ? { ...agent.tools }
        : deriveToolsFromPermission(agent.permission || agent.permissions, TOOL_OPTIONS),
      permission: agent.permission || agent.permissions || { "*": "ask" },
      steps: agent.steps ?? agent.maxSteps,
      disable: false,
      hidden: agent.hidden,
      source: agent.source === "json" ? "json" : "markdown",
      scope: "global",
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHelp title={t('title')} docUrl="https://opencode.ai/docs/agents" docTitle={t('docTitle')} />
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setHelpOpen(true)} aria-label="Page help">
            ?
          </Button>
          <Button onClick={() => openEditor()}>
          <Plus className="h-4 w-4" />
          {t('newAgent')}
        </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">{t('loading')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pb-4">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={`${agent.source}-${agent.name}`}
              agent={agent}
              onEdit={() => openEditor(agent)}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-none w-screen h-screen rounded-none border-none overflow-hidden p-0">
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b p-6">
              <DialogTitle>{editing ? t('editAgent') : t('newAgent')}</DialogTitle>
              <DialogDescription>{t('dialogDescription')}</DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('nameLabel')}</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t('namePlaceholder')}
                    disabled={!!editing}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('descriptionLabel')}</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder={t('descriptionPlaceholder')}
                    className="min-h-[88px] resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('modeLabel')}</Label>
                  <Select value={form.mode || "subagent"} onValueChange={(v) => setForm((prev) => ({ ...prev, mode: v as AgentConfig["mode"] }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((mode) => (
                        <SelectItem key={mode} value={mode || "subagent"}>
                          {mode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('modelLabel')}</Label>
                  <Input
                    value={form.model}
                    onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
                    placeholder="anthropic/claude-sonnet-4-20250514"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('temperatureLabel')}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={form.temperature}
                    onChange={(e) => setForm((prev) => ({ ...prev, temperature: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('topPLabel')}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={form.top_p || ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, top_p: e.target.value ? Number(e.target.value) : 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('stepsLabel')}</Label>
                  <Input
                    type="number"
                    value={form.steps ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, steps: e.target.value ? Number(e.target.value) : undefined }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('colorLabel')}</Label>
                  <div className="flex items-center gap-2">
                    <div className="relative h-9 w-9 shrink-0 rounded-md border overflow-hidden">
                      <div
                        className="absolute inset-0"
                        style={{ backgroundColor: THEME_COLOR_PREVIEW[form.color] || (form.color?.startsWith("#") ? form.color : "#cccccc") }}
                      />
                      <input
                        type="color"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        value={form.color?.startsWith("#") ? form.color : "#cccccc"}
                        onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                      />
                    </div>
                    <Input
                      value={form.color || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                      placeholder="#FF5733 or primary"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(THEME_COLOR_PREVIEW).map(([name, color]) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, color: name }))}
                        className={cn(
                          "h-6 w-6 rounded-md border-2 transition-transform hover:scale-110",
                          form.color === name ? "border-foreground ring-2 ring-offset-1 ring-foreground" : "border-border"
                        )}
                        style={{ backgroundColor: color }}
                        title={name}
                      />
                    ))}
                  </div>
                </div>
                {!editing && (
                  <>
                    <div className="space-y-2">
                       <Label>{t('sourceLabel')}</Label>
                      <Select value={form.source} onValueChange={(v) => setForm((prev) => ({ ...prev, source: v as AgentFormState["source"] }))}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="markdown">Markdown</SelectItem>
                           <SelectItem value="json">JSON</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="space-y-2">
                       <Label>{t('scopeLabel')}</Label>
                      <Select value={form.scope} onValueChange={(v) => setForm((prev) => ({ ...prev, scope: v as AgentFormState["scope"] }))}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value="global">{t('global')}</SelectItem>
                           <SelectItem value="project">{t('project')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={!!form.disable} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, disable: checked }))} />
                  {t('disabled')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={!!form.hidden} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, hidden: checked }))} />
                  {t('hidden')}
                </label>
              </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('systemPrompt')}</Label>
                    <Editor
                      height="30vh"
                      language="markdown"
                      theme={theme === "dark" ? "vs-dark" : "light"}
                      value={form.prompt}
                      onChange={(value) => setForm((prev) => ({ ...prev, prompt: value || "" }))}
                      options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
                    />
                  </div>

                  <div className="space-y-2 pt-4 border-t">
                    <div className="space-y-0.5">
                      <Label className="text-base">{t('toolPermissions')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('toolPermissionsDescription')}
                      </p>
                    </div>
                    <div className="border rounded-md p-4 max-h-[35vh] overflow-y-auto">
                      <PermissionEditor
                        value={form.permission}
                        onChange={(next) => setForm((prev) => ({ ...prev, permission: next }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t p-4">
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={handleSave}>{t('saveAgent')}</Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PageHelpDialog open={helpOpen} onOpenChange={setHelpOpen} page="agents" />
    </div>
  );
}
