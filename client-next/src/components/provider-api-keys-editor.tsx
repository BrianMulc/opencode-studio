"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Alert } from "@nsmr/pixelart-react";
import { setProviderApiKey } from "@/lib/api";
import type { OpencodeConfig } from "@/types";

// Lets users set/clear the apiKey of each provider in the ACTIVE opencode.json.
// Works for any config — preset-created or hand-written — so profile presets
// can ship without secrets. Keys are written to the config file on save and
// never echoed back by the server.
export function ProviderApiKeysEditor({ config, onSaved }: { config: OpencodeConfig; onSaved: () => void }) {
  const t = useTranslations('settings.providerKeys');
  const providers = Object.entries(config.provider || {});
  // Drafts keyed by provider id; inputs start empty (placeholder shows status)
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  if (providers.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noProviders')}</p>;
  }

  const handleSave = async (providerId: string) => {
    const draft = drafts[providerId];
    if (draft === undefined || draft === "") return;
    try {
      setSaving(providerId);
      await setProviderApiKey(providerId, draft);
      toast.success(t('saved', { provider: providerId }));
      setDrafts(prev => ({ ...prev, [providerId]: "" }));
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleClear = async (providerId: string) => {
    try {
      setSaving(providerId);
      await setProviderApiKey(providerId, "");
      toast.success(t('cleared', { provider: providerId }));
      setDrafts(prev => ({ ...prev, [providerId]: "" }));
      onSaved();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      {providers.map(([id, provider]) => {
        const existingKey = provider?.options?.apiKey;
        const hasKey = typeof existingKey === 'string' && existingKey.length > 0;
        const draft = drafts[id] ?? "";
        const dirty = draft.length > 0;
        return (
          <div key={id} className="flex flex-col gap-2 p-3 rounded-lg border border-border/60">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{provider?.name || id}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">{id}</p>
              </div>
              {hasKey ? (
                <Badge variant="outline" className="shrink-0 text-green-500 border-green-500/40">
                  <Check className="h-3 w-3 mr-1" />
                  {t('configured')}
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0 text-amber-500 border-amber-500/40">
                  <Alert className="h-3 w-3 mr-1" />
                  {t('notConfigured')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                autoComplete="off"
                placeholder={hasKey ? t('replacePlaceholder') : t('enterPlaceholder')}
                value={draft}
                onChange={(e) => setDrafts(prev => ({ ...prev, [id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleSave(id)}
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                onClick={() => handleSave(id)}
                disabled={!dirty || saving === id}
              >
                {t('save')}
              </Button>
              {hasKey && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleClear(id)}
                  disabled={saving === id}
                >
                  {t('clear')}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
