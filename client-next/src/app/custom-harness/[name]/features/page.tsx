"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { getCustomHarnessConfig, saveCustomHarnessConfig } from "@/lib/api";
import { useReload } from "@/components/reload-context";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

const FEATURE_FLAGS = [
  { key: "team_mode.enabled", label: "Team Mode", description: "Enable Team Mode (12 team_* tools + conditional hooks)" },
  { key: "tmux.enabled", label: "Tmux", description: "Enable tmux integration for interactive terminals" },
  { key: "hashline_edit", label: "Hashline Edit", description: "Enable hash-anchored edit tool with LINE#ID validation" },
  { key: "model_fallback", label: "Model Fallback", description: "Enable proactive model fallback on API errors" },
  { key: "runtime_fallback", label: "Runtime Fallback", description: "Enable reactive runtime fallback" },
  { key: "auto_update", label: "Auto Update", description: "Automatically check for updates" },
  { key: "ralph_loop.enabled", label: "Ralph Loop", description: "Enable ralph loop" },
  { key: "default_mode.ultrawork", label: "Ultrawork Mode", description: "Auto-inject ultrawork on session start" },
  { key: "default_mode.ralph_loop", label: "Auto Ralph Loop", description: "Auto-start ralph loop on session start" },
  { key: "experimental.aggressive_truncation", label: "Aggressive Truncation", description: "Aggressive context truncation" },
  { key: "experimental.auto_resume", label: "Auto Resume", description: "Auto-resume after errors" },
  { key: "experimental.preemptive_compaction", label: "Preemptive Compaction", description: "Preemptive context compaction" },
  { key: "experimental.task_system", label: "Task System", description: "Enable experimental task system" },
  { key: "experimental.hashline_edit", label: "Hashline Edit (Experimental)", description: "Enable hashline edit (experimental gate)" },
  { key: "notification.force_enable", label: "Force Notifications", description: "Force enable session notifications" },
  { key: "openclaw.enabled", label: "OpenClaw", description: "Enable OpenClaw bidirectional integration" },
  { key: "sisyphus_agent.disabled", label: "Disable Sisyphus", description: "Disable Sisyphus agent" },
  { key: "sisyphus_agent.tdd", label: "Sisyphus TDD", description: "Enable TDD mode for Sisyphus" },
  { key: "start_work.auto_commit", label: "Auto Commit", description: "Auto-commit on start-work" },
];

function getNestedValue(obj: any, key: string): any {
  const parts = key.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function setNestedValue(obj: any, key: string, value: any): void {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

export default function FeaturesPage() {
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

  const handleToggle = (key: string, value: boolean) => {
    const newConfig = { ...config };
    setNestedValue(newConfig, key, value);
    setConfig(newConfig);
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
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
          <h2 className="text-lg font-medium">{t('features')}</h2>
          <p className="text-muted-foreground">{t('featuresDescription')}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>

      <div className="grid gap-4">
        {FEATURE_FLAGS.map((feature) => {
          const value = getNestedValue(config, feature.key);
          const isEnabled = value === true;

          return (
            <Card key={feature.key}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">{feature.label}</CardTitle>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                  <code className="text-xs text-muted-foreground">{feature.key}</code>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => handleToggle(feature.key, checked)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
