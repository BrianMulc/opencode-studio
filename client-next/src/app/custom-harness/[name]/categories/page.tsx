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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";


const BUILTIN_CATEGORIES = [
  { name: "visual-engineering", description: "Frontend, UI/UX, design", model: "google/gemini-3.1-pro" },
  { name: "ultrabrain", description: "Hard logic, architecture decisions", model: "openai/gpt-5.5" },
  { name: "deep", description: "Autonomous multi-step problem-solving", model: "openai/gpt-5.5" },
  { name: "artistry", description: "Creative / unconventional approaches", model: "google/gemini-3.1-pro" },
  { name: "quick", description: "Trivial single-file changes", model: "openai/gpt-5.4-mini" },
  { name: "unspecified-low", description: "Moderate effort fallback", model: "anthropic/claude-sonnet-4-6" },
  { name: "unspecified-high", description: "High effort fallback", model: "anthropic/claude-opus-4-7" },
  { name: "writing", description: "Documentation, prose", model: "kimi-for-coding/k2p5" },
];

export default function CategoriesPage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const { triggerReload } = useReload();
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");

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

  const handleSelectCategory = (catName: string) => {
    setSelectedCategory(catName);
    const categories = (config.categories || {}) as Record<string, unknown>;
    const cat = (categories[catName] || {}) as Record<string, unknown>;
    setModel((cat.model as string) || "");
    setDescription((cat.description as string) || "");
  };

  const handleSave = async () => {
    if (!selectedCategory) return;
    try {
      setSaving(true);
      const newConfig = { ...config };
      const categories = { ...((newConfig.categories || {}) as Record<string, unknown>) };
      const cat = { ...(categories[selectedCategory] as Record<string, unknown> || {}) };
      
      if (model.trim()) cat.model = model.trim();
      else delete cat.model;
      
      if (description.trim()) cat.description = description.trim();
      else delete cat.description;
      
      categories[selectedCategory] = cat;
      newConfig.categories = categories;
      
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
        <h2 className="text-lg font-medium">{t('categories')}</h2>
        <p className="text-muted-foreground">{t('categoriesDescription')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-2">
          {BUILTIN_CATEGORIES.map((cat) => {
            const categories = (config.categories || {}) as Record<string, unknown>;
            const catCfg = (categories[cat.name] || {}) as Record<string, unknown>;
            const hasOverride = !!catCfg.model || !!catCfg.description;
            
            return (
              <button
                type="button"
                key={cat.name}
                onClick={() => handleSelectCategory(cat.name)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedCategory === cat.name
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{cat.name}</span>
                  {hasOverride && (
                    <Badge variant="secondary" className="text-xs">Modified</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{cat.description}</p>
                <p className="text-xs text-muted-foreground">Default: {cat.model}</p>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          {selectedCategory ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{selectedCategory}</CardTitle>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? t('saving') : t('save')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedCategory && (() => {
                  const defaultCat = BUILTIN_CATEGORIES.find(c => c.name === selectedCategory);
                  return defaultCat ? (
                    <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Default Configuration</div>
                        <Badge variant="outline" className="text-xs">Default</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm">
                          <span className="text-muted-foreground">Model: </span>
                          <span className="font-mono">{defaultCat.model}</span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Description: </span>
                          <span>{defaultCat.description}</span>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}

                <div className="space-y-2">
                  <div className="text-sm font-medium">Model Override</div>
                  <Input
                    placeholder="e.g., openai/gpt-5.5"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the default model.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Description Override</div>
                  <Input
                    placeholder="Category description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the default description.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">Select a category to edit its configuration</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
