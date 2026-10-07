"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { PermissionConfig, PermissionRule, PermissionValue } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Trash } from "@nsmr/pixelart-react";

// V2 canonical actions. Legacy aliases (bash->shell, task->subagent,
// write/patch->edit) translate on save; they appear below only if present
// in a legacy map so old configs stay editable.
const TOOL_LIST = [
  "read",
  "edit",
  "glob",
  "grep",
  "list",
  "shell",
  "subagent",
  "skill",
  "lsp",
  "todoread",
  "todowrite",
  "webfetch",
  "websearch",
  "question",
  "external_directory",
  "doom_loop",
] as const;

const EFFECTS: PermissionValue[] = ["allow", "ask", "deny"];

type PermissionMode = "simple" | "map" | "list";

function getMode(value: PermissionConfig[keyof PermissionConfig] | undefined): PermissionMode {
  if (!value || typeof value === "string") return "simple";
  const keys = Object.keys(value);
  const isList = keys.every((k) => k === "allow" || k === "deny");
  return isList ? "list" : "map";
}

function toArrayInput(values?: string[]) {
  return (values || []).join(", ");
}

function fromArrayInput(input: string) {
  return input
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

interface PermissionEditorProps {
  value: PermissionConfig | PermissionRule[];
  onChange: (next: PermissionConfig | PermissionRule[]) => void;
  className?: string;
}

function isRuleArray(value: PermissionConfig | PermissionRule[]): value is PermissionRule[] {
  return Array.isArray(value);
}

function OrderedRulesEditor({ value, onChange }: { value: PermissionRule[]; onChange: (next: PermissionRule[]) => void }) {
  const t = useTranslations("common");

  const updateRule = (index: number, patch: Partial<PermissionRule>) => {
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRule = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const moveRule = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="flex flex-col h-full">
      <p className="text-xs text-muted-foreground mb-3">
        {t("permissions.orderedHint")}
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-2">
        {value.length === 0 && (
          <p className="text-xs text-muted-foreground italic">{t("permissions.noRules")}</p>
        )}
        {value.map((rule, i) => (
          <div key={i} className="flex flex-col gap-2 md:flex-row md:items-center rounded-md border bg-muted/20 border-border/60 p-3">
            <Input
              className="font-mono h-8 text-xs md:w-[130px]"
              value={rule.action}
              onChange={(e) => updateRule(i, { action: e.target.value })}
              placeholder={t("permissions.actionPlaceholder")}
              list="permission-actions"
            />
            <Input
              className="font-mono h-8 text-xs flex-1"
              value={rule.resource}
              onChange={(e) => updateRule(i, { resource: e.target.value })}
              placeholder={t("permissions.resourcePlaceholder")}
            />
            <Select value={rule.effect} onValueChange={(next) => updateRule(i, { effect: next as PermissionValue })}>
              <SelectTrigger className="md:w-[100px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EFFECTS.map((e) => (
                  <SelectItem key={e} value={e}>{t(`permissions.${e}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => moveRule(i, -1)} title={t("permissions.moveUp")}>↑</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === value.length - 1} onClick={() => moveRule(i, 1)} title={t("permissions.moveDown")}>↓</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeRule(i)}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <datalist id="permission-actions">
          {TOOL_LIST.map((tool) => (
            <option key={tool} value={tool} />
          ))}
        </datalist>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-xs mt-3 self-start"
        onClick={() => onChange([...value, { action: "shell", resource: "*", effect: "ask" as PermissionValue }])}
      >
        <Plus className="h-3 w-3" />
        {t("permissions.addRule")}
      </Button>
    </div>
  );
}

export function PermissionEditor({ value, onChange, className }: PermissionEditorProps) {
  if (isRuleArray(value)) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <OrderedRulesEditor value={value} onChange={onChange} />
      </div>
    );
  }
  return <MapPermissionEditor value={value} onChange={onChange} className={className} />;
}

function MapPermissionEditor({ value, onChange, className }: { value: PermissionConfig; onChange: (next: PermissionConfig) => void; className?: string }) {
  const t = useTranslations("common");
  const [patternDrafts, setPatternDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const tools = useMemo(() => {
    // Canonical actions first, then any extra keys present in a legacy map
    // (bash/task/write/patch aliases, MCP server actions, plugin actions).
    const extra = Object.keys(value ?? {}).filter((k) => !(TOOL_LIST as readonly string[]).includes(k));
    const all = [...TOOL_LIST, ...extra];
    return all.filter((tool) => {
      const matchesSearch = tool.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (onlyEnabled) {
        const current = value[tool as keyof PermissionConfig];
        return !!current && current !== "ask";
      }
      return true;
    });
  }, [search, onlyEnabled, value]);

  const updateTool = (tool: keyof PermissionConfig, next: any) => {
    onChange({
      ...value,
      [tool]: next,
    } as PermissionConfig);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex flex-col gap-4 mb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={t("permissions.searchTools")}
            className="h-8 w-[150px] lg:w-[240px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 gap-2", onlyEnabled && "bg-accent text-accent-foreground")}
            onClick={() => setOnlyEnabled(!onlyEnabled)}
          >
            {t("permissions.enabledOnly")}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {t("permissions.toolsFound", { count: tools.length })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-3">
        {tools.map((tool) => {
          const current = value[tool as keyof PermissionConfig];
          const mode = getMode(current);
          const draft = patternDrafts[tool] || "";

          return (
            <div key={tool} className="rounded-md border bg-muted/20 border-border/60 p-4 transition-colors hover:border-border">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary/40" />
                  <div className="font-mono text-sm font-medium">{tool}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={mode}
                    onValueChange={(next) => {
                      if (next === "simple") updateTool(tool as keyof PermissionConfig, "ask");
                      if (next === "map") updateTool(tool as keyof PermissionConfig, { "*": "ask" } as PermissionConfig);
                      if (next === "list")
                        updateTool(
                          tool as keyof PermissionConfig,
                          { allow: [], deny: [] } as unknown as PermissionConfig[keyof PermissionConfig]
                        );
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">{t("permissions.simple")}</SelectItem>
                       <SelectItem value="map">{t("permissions.patternMap")}</SelectItem>
                       <SelectItem value="list">{t("permissions.allowDenyList")}</SelectItem>
                    </SelectContent>
                  </Select>

                  {mode === "simple" && (
                    <Select
                      value={typeof current === "string" ? current : "ask"}
                      onValueChange={(next) => updateTool(tool as keyof PermissionConfig, next as PermissionValue)}
                    >
                      <SelectTrigger className="w-[100px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allow">{t("permissions.allow")}</SelectItem>
                        <SelectItem value="ask">{t("permissions.ask")}</SelectItem>
                        <SelectItem value="deny">{t("permissions.deny")}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {mode === "map" &&
                typeof current === "object" &&
                current &&
                !Array.isArray(current) &&
                !("allow" in current || "deny" in current) && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    {Object.entries(current as Record<string, PermissionValue>).map(([pattern, rule]) => (
                      <div key={pattern} className="flex flex-col gap-2 md:flex-row md:items-center">
                        <Input className="font-mono h-8 text-xs flex-1" value={pattern} readOnly />
                        <Select
                          value={rule as string}
                          onValueChange={(next) => {
                            updateTool(tool as keyof PermissionConfig, { ...current, [pattern]: next });
                          }}
                        >
                          <SelectTrigger className="w-[100px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                           <SelectContent>
                             <SelectItem value="allow">{t("permissions.allow")}</SelectItem>
                             <SelectItem value="ask">{t("permissions.ask")}</SelectItem>
                             <SelectItem value="deny">{t("permissions.deny")}</SelectItem>
                           </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const { [pattern]: _removed, ...rest } = current as any;
                            updateTool(tool as keyof PermissionConfig, Object.keys(rest).length ? rest : "ask");
                          }}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    <div className="flex flex-col gap-2 md:flex-row md:items-center pt-2">
                      <Input
                        className="font-mono h-8 text-xs flex-1"
                        placeholder={t("permissions.addPatternPlaceholder")}
                        value={draft}
                        onChange={(e) => setPatternDrafts((prev) => ({ ...prev, [tool]: e.target.value }))}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2 text-xs"
                        onClick={() => {
                          if (!draft.trim()) return;
                          updateTool(tool as keyof PermissionConfig, { ...current, [draft.trim()]: "ask" });
                          setPatternDrafts((prev) => ({ ...prev, [tool]: "" }));
                        }}
                      >
                        <Plus className="h-3 w-3" />
                        {t("permissions.add")}
                      </Button>
                    </div>
                  </div>
                )}

              {mode === "list" && typeof current === "object" && current && ("allow" in current || "deny" in current) && (
                <div className="mt-4 grid gap-4 md:grid-cols-2 border-t pt-4">
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                      {t("permissions.allowPatterns")}
                    </div>
                    <Textarea
                      className="min-h-[80px] text-xs font-mono resize-none"
                      value={toArrayInput((current as { allow?: string[] }).allow)}
                      onChange={(e) => {
                        updateTool(tool as keyof PermissionConfig, {
                          ...(current as object),
                          allow: fromArrayInput(e.target.value),
                        });
                      }}
                      placeholder={t("permissions.allowPlaceholder")}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                      {t("permissions.denyPatterns")}
                    </div>
                    <Textarea
                      className="min-h-[80px] text-xs font-mono resize-none border-destructive/20 focus-visible:border-destructive/40"
                      value={toArrayInput((current as { deny?: string[] }).deny)}
                      onChange={(e) => {
                        updateTool(tool as keyof PermissionConfig, {
                          ...(current as object),
                          deny: fromArrayInput(e.target.value),
                        });
                      }}
                      placeholder={t("permissions.denyPlaceholder")}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
