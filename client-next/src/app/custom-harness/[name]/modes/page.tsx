"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { getSourceFile } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface ModeConfig {
  key: string;
  displayName: string;
  description: string;
  path: string;
  hasVariants?: boolean;
  variants?: { key: string; displayName: string; path: string }[];
}

const MODES: ModeConfig[] = [
  {
    key: "ultrawork",
    displayName: "Ultrawork",
    description: "Full orchestration mode activated by 'ultrawork' or 'ulw' keywords. Instructs the agent to run parallel specialists and execute relentlessly until done.",
    path: "packages/prompts-core/prompts/ultrawork/default.md",
    hasVariants: true,
    variants: [
      { key: "default", displayName: "Default (Claude-optimized)", path: "packages/prompts-core/prompts/ultrawork/default.md" },
      { key: "gpt", displayName: "GPT", path: "packages/prompts-core/prompts/ultrawork/gpt.md" },
      { key: "gemini", displayName: "Gemini", path: "packages/prompts-core/prompts/ultrawork/gemini.md" },
      { key: "planner", displayName: "Planner Agent", path: "packages/prompts-core/prompts/ultrawork/planner.md" },
    ],
  },
  {
    key: "search",
    displayName: "Search",
    description: "Activated by search-related keywords. Maximizes search effort with parallel explore and librarian agents.",
    path: "packages/prompts-core/prompts/mode/search.md",
  },
  {
    key: "analyze",
    displayName: "Analyze",
    description: "Activated by analyze-related keywords. Deep analysis protocol with context gathering and Oracle consultation.",
    path: "packages/prompts-core/prompts/mode/analyze.md",
  },
  {
    key: "team",
    displayName: "Team",
    description: "Activated by 'team mode' keyword. Orchestrates via team_* tools with closure sequence responsibility.",
    path: "packages/prompts-core/prompts/mode/team.md",
  },
  {
    key: "hyperplan",
    displayName: "Hyperplan",
    description: "Activated by 'hyperplan' or 'hpp' keyword. Loads hyperplan skill for 5-member adversarial planning.",
    path: "packages/prompts-core/prompts/mode/hyperplan.md",
  },
];

export default function ModesPage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function load() {
      const newContents: Record<string, string> = {};
      const newLoading: Record<string, boolean> = {};

      for (const mode of MODES) {
        if (mode.hasVariants && mode.variants) {
          for (const variant of mode.variants) {
            const key = `${mode.key}-${variant.key}`;
            newLoading[key] = true;
            try {
              const data = await getSourceFile(name, variant.path);
              if (data.ok) {
                newContents[key] = data.content;
              }
            } catch {
              // silently fail for missing files
            } finally {
              newLoading[key] = false;
            }
          }
        } else {
          newLoading[mode.key] = true;
          try {
            const data = await getSourceFile(name, mode.path);
            if (data.ok) {
              newContents[mode.key] = data.content;
            }
          } catch {
            // silently fail
          } finally {
            newLoading[mode.key] = false;
          }
        }
      }

      setContents(newContents);
      setLoading(newLoading);
    }
    load();
  }, [name]);

  const isLoading = (key: string) => loading[key] || false;
  const getContent = (key: string) => contents[key] || null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t('modes') || 'Modes'}</h2>
        <p className="text-muted-foreground">
          {t('modesDescription') || 'Keyword-triggered behavior overlays. These are injected into user messages when specific keywords are detected, not agent system prompts.'}
        </p>
      </div>

      <div className="space-y-4">
        {MODES.map((mode) => (
          <Card key={mode.key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{mode.displayName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{mode.description}</p>
                </div>
                <Badge variant="outline">Mode</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {mode.hasVariants && mode.variants ? (
                <Tabs defaultValue={mode.variants[0].key}>
                  <TabsList>
                    {mode.variants.map((variant) => (
                      <TabsTrigger key={variant.key} value={variant.key}>
                        {variant.displayName}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {mode.variants.map((variant) => {
                    const key = `${mode.key}-${variant.key}`;
                    const content = getContent(key);
                    const loadingVariant = isLoading(key);
                    return (
                      <TabsContent key={variant.key} value={variant.key}>
                        {loadingVariant ? (
                          <Skeleton className="h-32" />
                        ) : content ? (
                          <Textarea
                            value={content}
                            readOnly
                            rows={12}
                            className="font-mono text-sm bg-muted/50"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t('noSourceFiles') || 'No source files found.'}
                          </p>
                        )}
                      </TabsContent>
                    );
                  })}
                </Tabs>
              ) : (
                <div>
                  {isLoading(mode.key) ? (
                    <Skeleton className="h-32" />
                  ) : (() => {
                    const content = getContent(mode.key);
                    return content ? (
                      <Textarea
                        value={content}
                        readOnly
                        rows={8}
                        className="font-mono text-sm bg-muted/50"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('noSourceFiles') || 'No source files found.'}
                      </p>
                    );
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
