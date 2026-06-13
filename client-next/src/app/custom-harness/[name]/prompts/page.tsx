"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { getCustomHarnessConfig, saveCustomHarnessConfig, getSourceFile } from "@/lib/api";
import { useReload } from "@/components/reload-context";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AGENT_GROUPS = {
  inline: [
    { name: "oracle", displayName: "Oracle", description: "Read-only consultant for debugging and architecture" },
    { name: "librarian", displayName: "Librarian", description: "External docs, OSS, and web research" },
    { name: "explore", displayName: "Explore", description: "Contextual grep and codebase search" },
    { name: "metis", displayName: "Metis", description: "Pre-planning consultant for scope analysis" },
    { name: "momus", displayName: "Momus", description: "Expert reviewer for work plans" },
    { name: "multimodal-looker", displayName: "Multimodal-Looker", description: "Media file analysis (PDFs, images, diagrams)" },
  ],
  dynamic: [
    { name: "sisyphus", displayName: "Sisyphus", description: "Discipline agent — task orchestration and delegation" },
    { name: "hephaestus", displayName: "Hephaestus", description: "Build agent — tool execution and verification" },
    { name: "sisyphus-junior", displayName: "Sisyphus-Junior", description: "Lightweight discipline agent for simpler tasks" },
  ],
  bundled: [
    { name: "atlas", displayName: "Atlas", description: "Context builder — loads project context and rules" },
    { name: "prometheus", displayName: "Prometheus", description: "Plan agent — creates multi-step work plans" },
  ],
};

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

export default function PromptsPage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const { triggerReload } = useReload();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [promptAppend, setPromptAppend] = useState("");
  const [promptOverride, setPromptOverride] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState<string | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

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

  const getDefaultPromptPath = (agentName: string): string | null => {
    // Map agent names to their prompt file paths
    const promptMap: Record<string, string> = {
      'atlas': 'packages/prompts-core/prompts/atlas/default.md',
      'prometheus': 'packages/prompts-core/prompts/prometheus/default.md',
      'sisyphus': 'packages/prompts-core/prompts/mode/analyze.md',
      'hephaestus': 'packages/prompts-core/prompts/mode/team.md',
      'sisyphus-junior': 'packages/prompts-core/prompts/mode/search.md',
    };
    return promptMap[agentName] || null;
  };

  const handleSelectAgent = async (agentName: string) => {
    setSelectedAgent(agentName);
    const agentCfg = getAgentConfig(config, agentName);
    setPromptAppend((agentCfg.prompt_append as string) || "");
    setPromptOverride((agentCfg.prompt as string) || "");
    
    // Load default prompt from source
    const promptPath = getDefaultPromptPath(agentName);
    if (promptPath) {
      setLoadingPrompt(true);
      try {
        const data = await getSourceFile(name, promptPath);
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
    } else {
      setDefaultPrompt(null);
    }
  };

  const handleSave = async () => {
    if (!selectedAgent) return;
    try {
      setSaving(true);
      const agentCfg = getAgentConfig(config, selectedAgent);
      const newAgentCfg = { ...agentCfg };
      
      if (promptOverride.trim()) {
        newAgentCfg.prompt = promptOverride.trim();
      } else {
        delete newAgentCfg.prompt;
      }
      
      if (promptAppend.trim()) {
        newAgentCfg.prompt_append = promptAppend.trim();
      } else {
        delete newAgentCfg.prompt_append;
      }
      
      const newConfig = setAgentConfig(config, selectedAgent, newAgentCfg);
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
          {[
            <Skeleton key="skel-1" className="h-20" />,
            <Skeleton key="skel-2" className="h-20" />,
            <Skeleton key="skel-3" className="h-20" />,
            <Skeleton key="skel-4" className="h-20" />,
            <Skeleton key="skel-5" className="h-20" />,
            <Skeleton key="skel-6" className="h-20" />,
          ]}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t('prompts')}</h2>
        <p className="text-muted-foreground">{t('promptsDescription')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Tabs defaultValue="inline">
            <TabsList className="w-full">
              <TabsTrigger value="inline">Inline</TabsTrigger>
              <TabsTrigger value="dynamic">Dynamic</TabsTrigger>
              <TabsTrigger value="bundled">Bundled</TabsTrigger>
            </TabsList>
            
            {(Object.keys(AGENT_GROUPS) as Array<keyof typeof AGENT_GROUPS>).map((group) => (
              <TabsContent key={group} value={group} className="space-y-2">
                {AGENT_GROUPS[group].map((agent) => {
                  const agentCfg = getAgentConfig(config, agent.name);
                  const hasOverride = !!agentCfg.prompt || !!agentCfg.prompt_append;
                  
                  return (
                    <button
                      type="button"
                      key={agent.name}
                      onClick={() => handleSelectAgent(agent.name)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedAgent === agent.name
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{agent.displayName}</span>
                        {hasOverride && (
                          <Badge variant="secondary" className="text-xs">Modified</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
                    </button>
                  );
                })}
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <div className="lg:col-span-2">
          {selectedAgent ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {AGENT_GROUPS.inline.find(a => a.name === selectedAgent)?.displayName ||
                     AGENT_GROUPS.dynamic.find(a => a.name === selectedAgent)?.displayName ||
                     AGENT_GROUPS.bundled.find(a => a.name === selectedAgent)?.displayName ||
                     selectedAgent}
                  </CardTitle>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? t('saving') : t('save')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingPrompt && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Default Prompt</div>
                    <Skeleton className="h-32" />
                  </div>
                )}
                {defaultPrompt && !loadingPrompt && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Default Prompt (read-only)</div>
                    <div className="relative">
                      <Textarea
                        value={defaultPrompt}
                        readOnly
                        rows={8}
                        className="font-mono text-sm bg-muted/50"
                      />
                      <div className="absolute top-2 right-2">
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This is the default system prompt for this agent. Use the fields below to override or append.
                    </p>
                  </div>
                )}
                {!defaultPrompt && !loadingPrompt && selectedAgent && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Default Prompt</div>
                    <p className="text-sm text-muted-foreground">
                      No default prompt file found for this agent. The prompt may be defined inline in the source code.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-sm font-medium">Prompt Override (replaces entire prompt)</div>
                  <Textarea
                    placeholder="Enter full prompt override..."
                    value={promptOverride}
                    onChange={(e) => setPromptOverride(e.target.value)}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the default prompt. Setting this replaces the entire system prompt.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Prompt Append (appended to default prompt)</div>
                  <Textarea
                    placeholder="Enter additional instructions to append..."
                    value={promptAppend}
                    onChange={(e) => setPromptAppend(e.target.value)}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    These instructions will be appended after the default prompt. Use this for additive customization.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">Select an agent from the list to edit its prompts</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
