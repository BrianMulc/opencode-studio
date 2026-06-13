"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { getCustomHarnessConfig, saveCustomHarnessConfig } from "@/lib/api";
import { useReload } from "@/components/reload-context";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const CANONICAL_ORDER = [
  "sisyphus", "hephaestus", "prometheus", "atlas",
  "oracle", "librarian", "explore", "metis", "momus",
  "multimodal-looker", "sisyphus-junior"
];

export default function DelegationPage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const { triggerReload } = useReload();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentOrder, setAgentOrder] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getCustomHarnessConfig(name);
        const cfg = data.config || {};
        setConfig(cfg);
        const order = (cfg.agent_order as string[]) || CANONICAL_ORDER;
        setAgentOrder(order);
      } catch (err) {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name]);

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...agentOrder];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setAgentOrder(newOrder);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const newConfig = { ...config, agent_order: agentOrder };
      await saveCustomHarnessConfig(name, newConfig);
      setConfig(newConfig);
      toast.success(t('saved'));
      triggerReload();
    } catch (err) {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setAgentOrder([...CANONICAL_ORDER]);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">{t('delegation')}</h2>
          <p className="text-muted-foreground">{t('delegationDescription')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Default
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent Delegation Order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {agentOrder.map((agent, index) => (
            <div
              key={agent}
              className="flex items-center justify-between p-3 rounded-lg border border-border"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-muted-foreground w-6">
                  {index + 1}
                </span>
                <span className="font-medium capitalize">{agent}</span>
                {CANONICAL_ORDER.indexOf(agent) !== index && (
                  <Badge variant="outline" className="text-xs">Moved</Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMove(index, 'up')}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMove(index, 'down')}
                  disabled={index === agentOrder.length - 1}
                >
                  ↓
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
