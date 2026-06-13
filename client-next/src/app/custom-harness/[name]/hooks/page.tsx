"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { getCustomHarnessConfig, saveCustomHarnessConfig } from "@/lib/api";
import { useReload } from "@/components/reload-context";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const HOOKS = [
  { name: "comment-checker", tier: "tool-guard", description: "Detects and blocks AI-generated comment patterns" },
  { name: "tool-output-truncator", tier: "tool-guard", description: "Truncates oversized tool outputs" },
  { name: "directory-agents-injector", tier: "tool-guard", description: "Injects agent metadata into directory reads" },
  { name: "directory-readme-injector", tier: "tool-guard", description: "Injects README context into directory reads" },
  { name: "empty-task-response-detector", tier: "tool-guard", description: "Detects empty task responses" },
  { name: "rules-injector", tier: "tool-guard", description: "Injects project rules into prompts" },
  { name: "tasks-todowrite-disabler", tier: "tool-guard", description: "Disables todowrite in certain contexts" },
  { name: "write-existing-file-guard", tier: "tool-guard", description: "Guards against overwriting existing files" },
  { name: "bash-file-read-guard", tier: "tool-guard", description: "Guards bash file read operations" },
  { name: "hashline-read-enhancer", tier: "tool-guard", description: "Enhances hashline read operations" },
  { name: "json-error-recovery", tier: "tool-guard", description: "Recovers from JSON errors" },
  { name: "read-image-resizer", tier: "tool-guard", description: "Resizes images before reading" },
  { name: "todo-description-override", tier: "tool-guard", description: "Overrides todo descriptions" },
  { name: "webfetch-redirect-guard", tier: "tool-guard", description: "Guards against redirect loops in webfetch" },
  { name: "fsync-skip-warning", tier: "tool-guard", description: "Warns about fsync skips" },
  { name: "notepad-write-guard", tier: "tool-guard", description: "Guards notepad writes" },
  { name: "plan-format-validator", tier: "tool-guard", description: "Validates plan format" },
  { name: "preemptive-compaction", tier: "session", description: "Preemptive context compaction" },
  { name: "session-recovery", tier: "session", description: "Session recovery after crashes" },
  { name: "session-notification", tier: "session", description: "Session notifications" },
  { name: "think-mode", tier: "session", description: "Think mode for complex reasoning" },
  { name: "model-fallback", tier: "session", description: "Model fallback on errors" },
  { name: "anthropic-context-window-limit-recovery", tier: "session", description: "Recovers from context window limits" },
  { name: "auto-update-checker", tier: "session", description: "Checks for auto-updates" },
  { name: "agent-usage-reminder", tier: "session", description: "Reminds about agent usage" },
  { name: "non-interactive-env", tier: "session", description: "Handles non-interactive environments" },
  { name: "interactive-bash-session", tier: "session", description: "Interactive bash session management" },
  { name: "ralph-loop", tier: "session", description: "Ralph loop management" },
  { name: "edit-error-recovery", tier: "session", description: "Recovers from edit errors" },
  { name: "delegate-task-retry", tier: "session", description: "Retries failed delegated tasks" },
  { name: "start-work", tier: "session", description: "Start work automation" },
  { name: "prometheus-md-only", tier: "session", description: "Prometheus markdown-only mode" },
  { name: "sisyphus-junior-notepad", tier: "session", description: "Sisyphus Junior notepad" },
  { name: "no-sisyphus-gpt", tier: "session", description: "Prevents Sisyphus from using GPT" },
  { name: "no-hephaestus-non-gpt", tier: "session", description: "Prevents Hephaestus from using non-GPT models" },
  { name: "hephaestus-agents-md-injector", tier: "session", description: "Injects agent metadata into Hephaestus" },
  { name: "question-label-truncator", tier: "session", description: "Truncates question labels" },
  { name: "task-resume-info", tier: "session", description: "Task resume information" },
  { name: "anthropic-effort", tier: "session", description: "Anthropic effort management" },
  { name: "runtime-fallback", tier: "session", description: "Runtime fallback management" },
  { name: "legacy-plugin-toast", tier: "session", description: "Legacy plugin toast notifications" },
  { name: "claude-code-hooks", tier: "transform", description: "Claude Code hook integration" },
  { name: "keyword-detector", tier: "transform", description: "Detects ultrawork/search/analyze/team keywords" },
  { name: "context-injector-messages-transform", tier: "transform", description: "Transforms context injector messages" },
  { name: "thinking-block-validator", tier: "transform", description: "Validates thinking blocks" },
  { name: "tool-pair-validator", tier: "transform", description: "Validates tool pairs" },
  { name: "stop-continuation-guard", tier: "continuation", description: "Guards against stopping continuation" },
  { name: "compaction-context-injector", tier: "continuation", description: "Injects compaction context" },
  { name: "compaction-todo-preserver", tier: "continuation", description: "Preserves todos during compaction" },
  { name: "todo-continuation-enforcer", tier: "continuation", description: "Enforces todo continuation" },
  { name: "unstable-agent-babysitter", tier: "continuation", description: "Babysits unstable agents" },
  { name: "background-notification", tier: "continuation", description: "Background task notifications" },
  { name: "atlas-hook", tier: "continuation", description: "Atlas-specific hook" },
  { name: "category-skill-reminder", tier: "skill", description: "Reminds about category skills" },
  { name: "auto-slash-command", tier: "skill", description: "Auto-executes slash commands" },
];

const TIER_COLORS: Record<string, string> = {
  "session": "border-l-blue-500",
  "tool-guard": "border-l-amber-500",
  "transform": "border-l-emerald-500",
  "continuation": "border-l-purple-500",
  "skill": "border-l-rose-500",
};

const TIER_LABELS: Record<string, string> = {
  "session": "Session",
  "tool-guard": "Tool Guard",
  "transform": "Transform",
  "continuation": "Continuation",
  "skill": "Skill",
};

export default function HooksPage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const { triggerReload } = useReload();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getCustomHarnessConfig(name);
        setConfig(data.config || {});
      } catch (err) {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name]);

  const disabledHooks = (config.disabled_hooks as string[]) || [];

  const handleToggle = (hookName: string, enabled: boolean) => {
    let newDisabled: string[];
    if (enabled) {
      newDisabled = disabledHooks.filter(h => h !== hookName);
    } else {
      newDisabled = [...disabledHooks, hookName];
    }
    setConfig({ ...config, disabled_hooks: newDisabled });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveCustomHarnessConfig(name, config);
      toast.success(t('saved'));
      triggerReload();
    } catch (err) {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const hooksByTier = HOOKS.reduce((acc, hook) => {
    if (!acc[hook.tier]) acc[hook.tier] = [];
    acc[hook.tier].push(hook);
    return acc;
  }, {} as Record<string, typeof HOOKS>);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">{t('hooks')}</h2>
          <p className="text-muted-foreground">{t('hooksDescription')}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>

      <div className="space-y-6">
        {Object.entries(hooksByTier).map(([tier, tierHooks]) => (
          <div key={tier} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {TIER_LABELS[tier]} ({tierHooks.length})
            </h3>
            <div className="grid gap-3">
              {tierHooks.map((hook) => {
                const enabled = !disabledHooks.includes(hook.name);
                return (
                  <Card key={hook.name} className={`border-l-4 ${TIER_COLORS[tier] || 'border-l-gray-500'}`}>
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{hook.name}</span>
                          <Badge variant="outline" className="text-xs">{TIER_LABELS[tier]}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{hook.description}</p>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) => handleToggle(hook.name, checked)}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
