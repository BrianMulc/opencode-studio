"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { getCustomHarnessConfig, saveCustomHarnessConfig, getSourceFile, getSourceFiles, saveSourceFile } from "@/lib/api";
import { useReload } from "@/components/reload-context";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


const ALL_AGENTS = [
  { name: "sisyphus", displayName: "Sisyphus", description: "Main orchestrator — plans, delegates, drives to completion" },
  { name: "hephaestus", displayName: "Hephaestus", description: "Autonomous deep worker — explores and executes end-to-end" },
  { name: "prometheus", displayName: "Prometheus", description: "Strategic planner — interview mode before any execution" },
  { name: "atlas", displayName: "Atlas", description: "Todo-list orchestrator — context builder and session tracker" },
  { name: "oracle", displayName: "Oracle", description: "Read-only consultant — debugging and architecture advisor" },
  { name: "librarian", displayName: "Librarian", description: "External docs, OSS, and web research specialist" },
  { name: "explore", displayName: "Explore", description: "Contextual grep and codebase search" },
  { name: "metis", displayName: "Metis", description: "Pre-planning consultant — scope analysis and ambiguity detection" },
  { name: "momus", displayName: "Momus", description: "Expert reviewer — evaluates work plans for gaps" },
  { name: "multimodal-looker", displayName: "Multimodal-Looker", description: "PDF, image, and diagram analysis" },
  { name: "sisyphus-junior", displayName: "Sisyphus-Junior", description: "Lightweight discipline agent for simpler tasks" },
];

/** Agents whose default prompt is a bundled markdown file with model variants */
const BUNDLED_AGENTS = new Set(["atlas", "prometheus"]);

/** Agents whose prompt is built dynamically at runtime (TypeScript function builders) */
const DYNAMIC_AGENTS = new Set(["sisyphus", "hephaestus", "sisyphus-junior"]);

function getAgentConfig(config: Record<string, unknown>, agentName: string) {
  const agents = (config.agents || {}) as Record<string, unknown>;
  return (agents[agentName] || {}) as Record<string, unknown>;
}

function setAgentConfig(config: Record<string, unknown>, agentName: string, agentCfg: Record<string, unknown>) {
  const newConfig = { ...config };
  const agents = { ...((newConfig.agents || {}) as Record<string, unknown>) };
  agents[agentName] = agentCfg;
  newConfig.agents = agents;
  return newConfig;
}

/** Resolve model ID to prompt variant name for bundled agents */
function resolveModelVariant(modelID: string | undefined): string {
  if (!modelID) return "default";
  const m = modelID.toLowerCase();
  if (m.includes("gpt") || m.includes("openai")) return "gpt";
  if (m.includes("gemini") || m.includes("google")) return "gemini";
  if (m.includes("kimi")) return "kimi";
  if (m.includes("opus") || m.includes("claude-opus")) return "opus-4-7";
  return "default";
}

function getDefaultPromptPath(agentName: string, modelID?: string): string | null {
  if (agentName === "atlas") {
    const variant = resolveModelVariant(modelID);
    return `packages/prompts-core/prompts/atlas/${variant}.md`;
  }
  if (agentName === "prometheus") {
    const variant = resolveModelVariant(modelID);
    return `packages/prompts-core/prompts/prometheus/${variant}.md`;
  }
  return null;
}

function getPromptTypeLabel(agentName: string): string {
  if (BUNDLED_AGENTS.has(agentName)) return "Bundled markdown (model-specific variants)";
  if (DYNAMIC_AGENTS.has(agentName)) return "Dynamically assembled at runtime";
  return "Inline TypeScript definition";
}

/** Map agent name to its source file path in the vendor package */
function getAgentSourcePath(agentName: string): string | null {
  const paths: Record<string, string> = {
    // Dynamic agents
    sisyphus: "src/agents/sisyphus/default.ts",
    hephaestus: "src/agents/hephaestus/agent.ts",
    "sisyphus-junior": "src/agents/sisyphus-junior/agent.ts",
    // Inline agents
    oracle: "src/agents/oracle.ts",
    librarian: "src/agents/librarian.ts",
    explore: "src/agents/explore.ts",
    metis: "src/agents/metis.ts",
    momus: "src/agents/momus.ts",
    "multimodal-looker": "src/agents/multimodal-looker.ts",
  };
  return paths[agentName] || null;
}

/** Get the source directory for dynamic agents (to list all .ts files) */
function getAgentSourceDir(agentName: string): string | null {
  const dirs: Record<string, string> = {
    sisyphus: "src/agents/sisyphus",
    hephaestus: "src/agents/hephaestus",
    "sisyphus-junior": "src/agents/sisyphus-junior",
  };
  return dirs[agentName] || null;
}

/** Get the prompt directory for bundled agents (to list all .md files) */
function getBundledPromptDir(agentName: string): string | null {
  if (agentName === "atlas") return "packages/prompts-core/prompts/atlas";
  if (agentName === "prometheus") return "packages/prompts-core/prompts/prometheus";
  return null;
}

/** Determine editable directory, file extension, and placeholder for an agent */
function getEditableDir(agentName: string): { dir: string; ext: string; placeholder: string } | null {
  if (DYNAMIC_AGENTS.has(agentName)) {
    const dir = getAgentSourceDir(agentName);
    return dir ? { dir, ext: ".ts", placeholder: "// New file\n" } : null;
  }
  if (BUNDLED_AGENTS.has(agentName)) {
    const dir = getBundledPromptDir(agentName);
    return dir ? { dir, ext: ".md", placeholder: "# New prompt\n" } : null;
  }
  return null;
}

export default function AgentsPage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const { triggerReload } = useReload();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Form state for selected agent
  const [formState, setFormState] = useState<Record<string, unknown>>({});
  const [defaultPrompt, setDefaultPrompt] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [agentSource, setAgentSource] = useState<string | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);

  // File browser state for dynamic agents
  const [sourceFiles, setSourceFiles] = useState<string[]>([]);
  const [selectedSourceFile, setSelectedSourceFile] = useState<string | null>(null);
  const [sourceFileContent, setSourceFileContent] = useState<string | null>(null);
  const [loadingSourceFile, setLoadingSourceFile] = useState(false);
  const [savingSourceFile, setSavingSourceFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getCustomHarnessConfig(name);
        setConfig(data.config || {});
      } catch {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name, t]);

  const loadDefaultPrompt = useCallback(async (agentName: string, modelID?: string) => {
    const path = getDefaultPromptPath(agentName, modelID);
    if (!path) {
      setDefaultPrompt(null);
      return;
    }
    setLoadingPrompt(true);
    try {
      const data = await getSourceFile(name, path);
      if (data.ok) {
        setDefaultPrompt(data.content);
      } else {
        setDefaultPrompt(null);
      }
    } catch {
      setDefaultPrompt(null);
    } finally {
      setLoadingPrompt(false);
    }
  }, [name]);

  const loadAgentSource = useCallback(async (agentName: string) => {
    const path = getAgentSourcePath(agentName);
    if (!path) {
      setAgentSource(null);
      return;
    }
    setLoadingSource(true);
    try {
      const data = await getSourceFile(name, path);
      if (data.ok) {
        setAgentSource(data.content);
      } else {
        setAgentSource(null);
      }
    } catch {
      setAgentSource(null);
    } finally {
      setLoadingSource(false);
    }
  }, [name]);

  const loadSourceFiles = useCallback(async (agentName: string) => {
    const editable = getEditableDir(agentName);
    if (!editable) {
      setSourceFiles([]);
      return;
    }
    try {
      const data = await getSourceFiles(name, editable.dir);
      if (data.ok && data.files) {
        const files = data.files
          .filter((f) => !f.isDirectory && f.name.endsWith(editable.ext))
          .map((f) => f.name);
        setSourceFiles(files);
      } else {
        setSourceFiles([]);
      }
    } catch {
      setSourceFiles([]);
    }
  }, [name]);

  const loadSourceFile = useCallback(async (fileName: string) => {
    if (!selectedAgent || !fileName) return;
    const editable = getEditableDir(selectedAgent);
    if (!editable) return;
    const path = `${editable.dir}/${fileName}`;
    setLoadingSourceFile(true);
    try {
      const data = await getSourceFile(name, path);
      if (data.ok) {
        setSourceFileContent(data.content);
        setSelectedSourceFile(fileName);
      } else {
        setSourceFileContent(null);
      }
    } catch {
      setSourceFileContent(null);
    } finally {
      setLoadingSourceFile(false);
    }
  }, [name, selectedAgent]);

  const handleCreateFile = async () => {
    if (!selectedAgent || !newFileName.trim()) return;
    const editable = getEditableDir(selectedAgent);
    if (!editable) return;
    const path = `${editable.dir}/${newFileName.trim()}`;
    if (!path.endsWith(editable.ext)) {
      toast.error(`File must end with ${editable.ext}`);
      return;
    }
    setCreatingFile(true);
    try {
      await saveSourceFile(name, path, editable.placeholder);
      toast.success("File created");
      const createdName = newFileName.trim();
      setNewFileName("");
      await loadSourceFiles(selectedAgent);
      await loadSourceFile(createdName);
    } catch {
      toast.error("Failed to create file");
    } finally {
      setCreatingFile(false);
    }
  };

  const handleSaveSourceFile = async () => {
    if (!selectedAgent || !selectedSourceFile || sourceFileContent === null) return;
    const editable = getEditableDir(selectedAgent);
    if (!editable) return;
    const path = `${editable.dir}/${selectedSourceFile}`;
    setSavingSourceFile(true);
    try {
      await saveSourceFile(name, path, sourceFileContent);
      toast.success(t('saved'));
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSavingSourceFile(false);
    }
  };

  const handleSelectAgent = async (agentName: string) => {
    setSelectedAgent(agentName);
    const agentCfg = getAgentConfig(config, agentName);
    setFormState({ ...agentCfg });
    setSourceFiles([]);
    setSelectedSourceFile(null);
    setSourceFileContent(null);

    if (BUNDLED_AGENTS.has(agentName)) {
      // Load default prompt and file list for bundled agents
      await loadDefaultPrompt(agentName, agentCfg.model as string);
      setAgentSource(null);
      setLoadingSource(false);
      await loadSourceFiles(agentName);
    } else {
      setDefaultPrompt(null);
      setLoadingPrompt(false);
      // Load source file for dynamic and inline agents
      await loadAgentSource(agentName);
      // Load file list for dynamic agents
      if (DYNAMIC_AGENTS.has(agentName)) {
        await loadSourceFiles(agentName);
      }
    }
  };

  const updateField = (field: string, value: unknown) => {
    setFormState((prev) => {
      const next = { ...prev };
      if (value === undefined || value === "" || value === false) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });

    // If model changed for bundled agent, reload default prompt
    if (field === "model" && BUNDLED_AGENTS.has(selectedAgent || "")) {
      loadDefaultPrompt(selectedAgent!, value as string);
    }
  };

  const handleSave = async () => {
    if (!selectedAgent) return;
    try {
      setSaving(true);
      const newConfig = setAgentConfig(config, selectedAgent, { ...formState });
      await saveCustomHarnessConfig(name, newConfig);
      setConfig(newConfig);
      toast.success(t('saved'));
      triggerReload();
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const getStringField = (field: string): string => (formState[field] as string) || "";
  const getNumberField = (field: string): number | undefined => {
    const v = formState[field];
    return typeof v === "number" ? v : undefined;
  };
  const getBooleanField = (field: string): boolean => !!formState[field];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`skel-${i}`} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t('agents')}</h2>
        <p className="text-muted-foreground">{t('agentsDescription')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left sidebar: agent list */}
        <div className="lg:col-span-1 space-y-2">
          {ALL_AGENTS.map((agent) => {
            const agentCfg = getAgentConfig(config, agent.name);
            const hasOverride = Object.keys(agentCfg).length > 0;
            const isDisabled = !!agentCfg.disable;

            return (
              <button
                type="button"
                key={agent.name}
                onClick={() => handleSelectAgent(agent.name)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedAgent === agent.name
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-accent'
                } ${isDisabled ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{agent.displayName}</span>
                  <div className="flex gap-1">
                    {hasOverride && (
                      <Badge variant="secondary" className="text-xs">Modified</Badge>
                    )}
                    {isDisabled && (
                      <Badge variant="destructive" className="text-xs">Disabled</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
              </button>
            );
          })}
        </div>

        {/* Right panel: agent editor */}
        <div className="lg:col-span-2">
          {selectedAgent ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {ALL_AGENTS.find(a => a.name === selectedAgent)?.displayName || selectedAgent}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Prompt type: {getPromptTypeLabel(selectedAgent)}
                    </p>
                  </div>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? t('saving') : t('save')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="identity">
                  <TabsList className="w-full">
                    <TabsTrigger value="identity">Identity</TabsTrigger>
                    <TabsTrigger value="model">Model</TabsTrigger>
                    <TabsTrigger value="prompts">Prompts</TabsTrigger>
                    <TabsTrigger value="generation">Generation</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  </TabsList>

                  {/* Identity Tab */}
                  <TabsContent value="identity" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Display Name</label>
                      <Input
                        placeholder="e.g., Sisyphus"
                        value={getStringField("displayName")}
                        onChange={(e) => updateField("displayName", e.target.value || undefined)}
                      />
                      <p className="text-xs text-muted-foreground">Shown in TUI agent selector</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        placeholder="What does this agent do?"
                        value={getStringField("description")}
                        onChange={(e) => updateField("description", e.target.value || undefined)}
                        rows={3}
                        className="font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Mode</label>
                      <div className="flex gap-2">
                        {(["primary", "subagent", "all"] as const).map((mode) => (
                          <Button
                            key={mode}
                            type="button"
                            variant={formState.mode === mode ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateField("mode", mode)}
                          >
                            {mode}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        primary = respects user UI model; subagent = uses own fallback chain; all = both
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Color</label>
                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder="#00CED1"
                          value={getStringField("color")}
                          onChange={(e) => updateField("color", e.target.value || undefined)}
                          className="font-mono w-32"
                        />
                        {typeof formState.color === "string" && formState.color && (
                          <div
                            className="w-6 h-6 rounded border"
                            style={{ backgroundColor: formState.color }}
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2 border-t">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">Disable Agent</div>
                        <p className="text-xs text-muted-foreground">Prevent this agent from being used</p>
                      </div>
                      <Switch
                        checked={getBooleanField("disable")}
                        onCheckedChange={(checked) => updateField("disable", checked || undefined)}
                      />
                    </div>
                  </TabsContent>

                  {/* Model Tab */}
                  <TabsContent value="model" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Model</label>
                      <Input
                        placeholder="e.g., openai/gpt-5.5"
                        value={getStringField("model")}
                        onChange={(e) => updateField("model", e.target.value || undefined)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Deprecated: use Category instead. Sets the specific model for this agent.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Category</label>
                      <Input
                        placeholder="e.g., ultrabrain"
                        value={getStringField("category")}
                        onChange={(e) => updateField("category", e.target.value || undefined)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Inherits model and settings from this category (recommended over Model)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Variant</label>
                      <Input
                        placeholder="e.g., high, xhigh"
                        value={getStringField("variant")}
                        onChange={(e) => updateField("variant", e.target.value || undefined)}
                      />
                      <p className="text-xs text-muted-foreground">Model variant override (e.g., thinking level)</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Fallback Models</label>
                      <Textarea
                        placeholder={"[\n  \"kimi-k2.6\",\n  \"openai/gpt-5.5\"\n]"}
                        value={(() => {
                          const v = formState.fallback_models;
                          return Array.isArray(v) ? JSON.stringify(v, null, 2) : "";
                        })()}
                        onChange={(e) => {
                          try {
                            const val = e.target.value.trim();
                            if (!val) {
                              updateField("fallback_models", undefined);
                              return;
                            }
                            const parsed = JSON.parse(val);
                            updateField("fallback_models", Array.isArray(parsed) ? parsed : undefined);
                          } catch {
                            // ignore invalid JSON while typing
                          }
                        }}
                        rows={4}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">JSON array of fallback model IDs</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Skills</label>
                      <Textarea
                        placeholder="skill1, skill2, skill3"
                        value={(() => {
                          const v = formState.skills;
                          return Array.isArray(v) ? v.join(", ") : "";
                        })()}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (!val) {
                            updateField("skills", undefined);
                            return;
                          }
                          updateField("skills", val.split(",").map((s) => s.trim()).filter(Boolean));
                        }}
                        rows={2}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated skill names to inject into agent prompt</p>
                    </div>
                  </TabsContent>

                  {/* Prompts Tab */}
                  <TabsContent value="prompts" className="space-y-4 pt-4">
                    {/* File browser for dynamic and bundled agents */}
                    {(DYNAMIC_AGENTS.has(selectedAgent) || BUNDLED_AGENTS.has(selectedAgent)) && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">
                          {BUNDLED_AGENTS.has(selectedAgent) ? "Prompt Variants" : "Source Files"}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <select
                              className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
                              value={selectedSourceFile || ""}
                              onChange={(e) => loadSourceFile(e.target.value)}
                            >
                              <option value="">Select a file...</option>
                              {sourceFiles.map((file) => (
                                <option key={file} value={file}>
                                  {file}
                                </option>
                              ))}
                            </select>
                            {selectedSourceFile && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSaveSourceFile}
                                disabled={savingSourceFile || sourceFileContent === null}
                              >
                                {savingSourceFile ? t('saving') : t('save')}
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder={BUNDLED_AGENTS.has(selectedAgent) ? "new-variant.md" : "new-file.ts"}
                              value={newFileName}
                              onChange={(e) => setNewFileName(e.target.value)}
                              className="h-8 text-sm"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCreateFile}
                              disabled={creatingFile || !newFileName.trim()}
                            >
                              {creatingFile ? "Creating..." : "+ New File"}
                            </Button>
                          </div>
                        </div>

                        {loadingSourceFile ? (
                          <Skeleton className="h-32" />
                        ) : sourceFileContent !== null ? (
                          <Textarea
                            value={sourceFileContent}
                            onChange={(e) => setSourceFileContent(e.target.value)}
                            rows={14}
                            className="font-mono text-sm bg-muted/50"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">Select a file from the dropdown above to view and edit.</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {BUNDLED_AGENTS.has(selectedAgent)
                            ? "Browse and edit all markdown prompt variants. Changes are saved directly to the source file."
                            : "Browse and edit all source files. Changes are saved directly to the source file."}
                        </p>
                      </div>
                    )}

                    {/* Default prompt display for bundled agents */}
                    {BUNDLED_AGENTS.has(selectedAgent) && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">Default Prompt</div>
                          <Badge variant="outline" className="text-xs">
                            {resolveModelVariant(getStringField("model"))} variant
                          </Badge>
                        </div>
                        {loadingPrompt ? (
                          <Skeleton className="h-32" />
                        ) : defaultPrompt ? (
                          <Textarea
                            value={defaultPrompt}
                            readOnly
                            rows={12}
                            className="font-mono text-sm bg-muted/50"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">No default prompt found for this model variant.</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          This is the bundled markdown prompt for the selected model. It changes automatically based on the Model field.
                        </p>
                      </div>
                    )}

                    {/* Source code display for dynamic and inline agents */}
                    {!BUNDLED_AGENTS.has(selectedAgent) && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">Source Code</div>
                          <Badge variant="outline" className="text-xs">
                            {getAgentSourcePath(selectedAgent) || "unknown"}
                          </Badge>
                        </div>

                        {loadingSource ? (
                          <Skeleton className="h-32" />
                        ) : agentSource ? (
                          <Textarea
                            value={agentSource}
                            readOnly
                            rows={12}
                            className="font-mono text-sm bg-muted/50"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">No source file found for this agent.</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          This is the actual TypeScript source code that defines the agent&apos;s prompt.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 pt-2 border-t">
                      <label className="text-sm font-medium">Prompt Override</label>
                      <Textarea
                        placeholder="Enter full prompt override..."
                        value={getStringField("prompt")}
                        onChange={(e) => updateField("prompt", e.target.value || undefined)}
                        rows={6}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Replaces the entire system prompt. Leave empty to use the default.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Prompt Append</label>
                      <Textarea
                        placeholder="Additional instructions to append..."
                        value={getStringField("prompt_append")}
                        onChange={(e) => updateField("prompt_append", e.target.value || undefined)}
                        rows={6}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Appended after the default prompt. Supports file:// URIs.
                      </p>
                    </div>
                  </TabsContent>

                  {/* Generation Tab */}
                  <TabsContent value="generation" className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Temperature</label>
                        <Input
                          type="number"
                          min={0}
                          max={2}
                          step={0.1}
                          placeholder="0.1"
                          value={getNumberField("temperature") ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateField("temperature", val ? parseFloat(val) : undefined);
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Top P</label>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          placeholder="1.0"
                          value={getNumberField("top_p") ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateField("top_p", val ? parseFloat(val) : undefined);
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Tokens</label>
                      <Input
                        type="number"
                        placeholder="e.g., 64000"
                        value={getNumberField("maxTokens") ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateField("maxTokens", val ? parseInt(val) : undefined);
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Thinking Type</label>
                        <div className="flex gap-2">
                          {(["enabled", "disabled"] as const).map((type) => (
                            <Button
                              key={type}
                              type="button"
                              variant={(formState.thinking as Record<string, unknown>)?.type === type ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                const current = (formState.thinking as Record<string, unknown>) || {};
                                if (current.type === type) {
                                  updateField("thinking", undefined);
                                } else {
                                  updateField("thinking", { ...current, type });
                                }
                              }}
                            >
                              {type}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Thinking Budget (tokens)</label>
                        <Input
                          type="number"
                          placeholder="e.g., 32000"
                          value={(() => {
                            const thinking = formState.thinking as Record<string, unknown>;
                            return typeof thinking?.budgetTokens === "number" ? thinking.budgetTokens : "";
                          })()}
                          onChange={(e) => {
                            const val = e.target.value;
                            const current = (formState.thinking as Record<string, unknown>) || {};
                            if (!val) {
                              const { budgetTokens: _, ...rest } = current;
                              updateField("thinking", Object.keys(rest).length > 0 ? rest : undefined);
                            } else {
                              updateField("thinking", { ...current, budgetTokens: parseInt(val) });
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Reasoning Effort</label>
                      <div className="flex flex-wrap gap-2">
                        {(["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const).map((level) => (
                          <Button
                            key={level}
                            type="button"
                            variant={formState.reasoningEffort === level ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (formState.reasoningEffort === level) {
                                updateField("reasoningEffort", undefined);
                              } else {
                                updateField("reasoningEffort", level);
                              }
                            }}
                          >
                            {level}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Text Verbosity</label>
                      <div className="flex gap-2">
                        {(["low", "medium", "high"] as const).map((level) => (
                          <Button
                            key={level}
                            type="button"
                            variant={formState.textVerbosity === level ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (formState.textVerbosity === level) {
                                updateField("textVerbosity", undefined);
                              } else {
                                updateField("textVerbosity", level);
                              }
                            }}
                          >
                            {level}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Advanced Tab */}
                  <TabsContent value="advanced" className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Ultrawork Model Override</label>
                        <Input
                          placeholder="e.g., openai/gpt-5.5"
                          value={(() => {
                            const uw = formState.ultrawork as Record<string, unknown>;
                            return (uw?.model as string) || "";
                          })()}
                          onChange={(e) => {
                            const current = (formState.ultrawork as Record<string, unknown>) || {};
                            const val = e.target.value;
                            if (!val) {
                              const { model: _, ...rest } = current;
                              updateField("ultrawork", Object.keys(rest).length > 0 ? rest : undefined);
                            } else {
                              updateField("ultrawork", { ...current, model: val });
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Ultrawork Variant</label>
                        <Input
                          placeholder="e.g., high"
                          value={(() => {
                            const uw = formState.ultrawork as Record<string, unknown>;
                            return (uw?.variant as string) || "";
                          })()}
                          onChange={(e) => {
                            const current = (formState.ultrawork as Record<string, unknown>) || {};
                            const val = e.target.value;
                            if (!val) {
                              const { variant: _, ...rest } = current;
                              updateField("ultrawork", Object.keys(rest).length > 0 ? rest : undefined);
                            } else {
                              updateField("ultrawork", { ...current, variant: val });
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Compaction Model Override</label>
                        <Input
                          placeholder="e.g., openai/gpt-5.5"
                          value={(() => {
                            const c = formState.compaction as Record<string, unknown>;
                            return (c?.model as string) || "";
                          })()}
                          onChange={(e) => {
                            const current = (formState.compaction as Record<string, unknown>) || {};
                            const val = e.target.value;
                            if (!val) {
                              const { model: _, ...rest } = current;
                              updateField("compaction", Object.keys(rest).length > 0 ? rest : undefined);
                            } else {
                              updateField("compaction", { ...current, model: val });
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Compaction Variant</label>
                        <Input
                          placeholder="e.g., high"
                          value={(() => {
                            const c = formState.compaction as Record<string, unknown>;
                            return (c?.variant as string) || "";
                          })()}
                          onChange={(e) => {
                            const current = (formState.compaction as Record<string, unknown>) || {};
                            const val = e.target.value;
                            if (!val) {
                              const { variant: _, ...rest } = current;
                              updateField("compaction", Object.keys(rest).length > 0 ? rest : undefined);
                            } else {
                              updateField("compaction", { ...current, variant: val });
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Provider Options (JSON)</label>
                      <Textarea
                        placeholder={'{\n  "key": "value"\n}'}
                        value={(() => {
                          const v = formState.providerOptions;
                          return v && typeof v === "object" ? JSON.stringify(v, null, 2) : "";
                        })()}
                        onChange={(e) => {
                          try {
                            const val = e.target.value.trim();
                            if (!val) {
                              updateField("providerOptions", undefined);
                              return;
                            }
                            const parsed = JSON.parse(val);
                            updateField("providerOptions", typeof parsed === "object" ? parsed : undefined);
                          } catch {
                            // ignore while typing
                          }
                        }}
                        rows={4}
                        className="font-mono text-sm"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">Select an agent from the list to configure</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
