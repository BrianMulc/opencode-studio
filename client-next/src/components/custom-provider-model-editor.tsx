"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { OpencodeConfig, ProviderConfig } from "@/types";
import { getProviders, getProviderBaseURL, getProviderPackage } from "@/lib/opencode-compat";
import { Check, Plus, Save, Trash } from "@nsmr/pixelart-react";

interface ModelDraft {
  source?: NonNullable<ProviderConfig["models"]>[string];
  key: string;
  id: string;
  name: string;
  contextLimit: string;
  inputLimit: string;
  outputLimit: string;
  inputCost: string;
  outputCost: string;
  cacheReadCost: string;
  cacheWriteCost: string;
  attachment: boolean;
  reasoning: boolean;
  temperature: boolean;
  toolCall: boolean;
  experimental: boolean;
}

interface ProviderDraft {
  source?: ProviderConfig;
  id: string;
  api: string;
  name: string;
  npm: string;
  envText: string;
  apiKey: string;
  baseURL: string;
  timeout: string;
  headerTimeout: string;
  chunkTimeout: string;
  timeoutDisabled: boolean;
  headerTimeoutDisabled: boolean;
  chunkTimeoutDisabled: boolean;
  setCacheKey: boolean;
  models: ModelDraft[];
}

interface CustomProviderModelEditorProps {
  config: OpencodeConfig;
  onSave: (updates: Partial<OpencodeConfig>) => Promise<void>;
}

function emptyModel(key = "model-id"): ModelDraft {
  return {
    key,
    id: "",
    name: "",
    contextLimit: "",
    inputLimit: "",
    outputLimit: "",
    inputCost: "",
    outputCost: "",
    cacheReadCost: "",
    cacheWriteCost: "",
    attachment: false,
    reasoning: false,
    temperature: false,
    toolCall: true,
    experimental: false,
  };
}

function emptyProvider(id = "custom-provider"): ProviderDraft {
  return {
    id,
    api: "openai-compatible",
    name: "",
    npm: "",
    envText: "",
    apiKey: "",
    baseURL: "",
    timeout: "",
    headerTimeout: "",
    chunkTimeout: "",
    timeoutDisabled: false,
    headerTimeoutDisabled: false,
    chunkTimeoutDisabled: false,
    setCacheKey: false,
    models: [emptyModel()],
  };
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumberText(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function modelDraftsFromProvider(provider: ProviderConfig): ModelDraft[] {
  return Object.entries(provider.models || {}).map(([key, model]) => ({
    source: model,
    key,
    id: toText((model as { modelID?: string }).modelID ?? model.id),
    name: toText(model.name),
    contextLimit: toNumberText(model.limit?.context),
    inputLimit: toNumberText(model.limit?.input),
    outputLimit: toNumberText(model.limit?.output),
    inputCost: toNumberText(model.cost?.input),
    outputCost: toNumberText(model.cost?.output),
    cacheReadCost: toNumberText(model.cost?.cache?.read ?? model.cost?.cache_read),
    cacheWriteCost: toNumberText(model.cost?.cache?.write ?? model.cost?.cache_write),
    attachment: model.attachment === true,
    reasoning: model.reasoning === true,
    temperature: model.temperature === true,
    toolCall: (model.capabilities?.tools ?? model.tool_call) !== false,
    experimental: model.experimental === true,
  }));
}

function providerDraftsFromConfig(config: OpencodeConfig): ProviderDraft[] {
  // V2 `providers` (native) + V1 `provider` (fallback); V2 wins on conflicts.
  return Object.entries(getProviders(config)).map(([id, provider]) => {
    const settings = (provider.settings ?? {}) as Record<string, unknown>;
    const options = provider.options || {};
    const num = (v: unknown) => toNumberText(v);
    const timeoutOf = (key: 'timeout' | 'headerTimeout' | 'chunkTimeout') =>
      num((settings[key] as number | false | undefined) ?? options[key]);
    const disabledOf = (key: 'timeout' | 'headerTimeout' | 'chunkTimeout') =>
      (settings[key] as unknown) === false || options[key] === false;
    return {
      source: provider,
      id,
      api: toText(provider.api ?? (settings.baseURL as string) ?? options.baseURL),
      name: toText(provider.name),
      npm: toText(getProviderPackage(provider)),
      envText: (provider.env || []).join(", "),
      apiKey: toText((settings.apiKey as string) ?? options.apiKey),
      baseURL: toText(getProviderBaseURL(provider)),
      timeout: timeoutOf('timeout'),
      headerTimeout: timeoutOf('headerTimeout'),
      chunkTimeout: timeoutOf('chunkTimeout'),
      timeoutDisabled: disabledOf('timeout'),
      headerTimeoutDisabled: disabledOf('headerTimeout'),
      chunkTimeoutDisabled: disabledOf('chunkTimeout'),
      setCacheKey: (settings.setCacheKey as boolean) === true || options.setCacheKey === true,
      models: modelDraftsFromProvider(provider),
    };
  });
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function setTextField<T extends object>(target: T, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) {
    (target as Record<string, unknown>)[key] = trimmed;
  } else {
    delete (target as Record<string, unknown>)[key];
  }
}

function buildModelConfig(model: ModelDraft) {
  const next: NonNullable<ProviderConfig["models"]>[string] = { ...(model.source || {}) };
  // V2-native `modelID` (V1 `id` accepted on read; server converts on write).
  setTextField(next, "modelID", model.id);
  delete (next as Record<string, unknown>).id;
  setTextField(next, "name", model.name);

  const limit: NonNullable<NonNullable<ProviderConfig["models"]>[string]["limit"]> = { ...(model.source?.limit || {}) };
  const context = parsePositiveNumber(model.contextLimit);
  const input = parsePositiveNumber(model.inputLimit);
  const output = parsePositiveNumber(model.outputLimit);
  if (context !== undefined) limit.context = context;
  else delete limit.context;
  if (input !== undefined) limit.input = input;
  else delete limit.input;
  if (output !== undefined) limit.output = output;
  else delete limit.output;
  if (Object.keys(limit).length > 0) next.limit = limit;
  else delete next.limit;

  const inputCost = parseNonNegativeNumber(model.inputCost);
  const outputCost = parseNonNegativeNumber(model.outputCost);
  if (inputCost !== undefined && outputCost !== undefined) {
    const cost: NonNullable<NonNullable<ProviderConfig["models"]>[string]["cost"]> = {
      ...(model.source?.cost || {}),
      input: inputCost,
      output: outputCost,
    };
    const cacheRead = parseNonNegativeNumber(model.cacheReadCost);
    const cacheWrite = parseNonNegativeNumber(model.cacheWriteCost);
    // V2-native cache object (server maps legacy cache_read/write on read).
    const cache = { ...((model.source?.cost as { cache?: Record<string, number> } | undefined)?.cache || {}) };
    if (cacheRead !== undefined) cache.read = cacheRead;
    else delete cache.read;
    if (cacheWrite !== undefined) cache.write = cacheWrite;
    else delete cache.write;
    if (Object.keys(cache).length > 0) cost.cache = cache;
    else delete cost.cache;
    delete (cost as Record<string, unknown>).cache_read;
    delete (cost as Record<string, unknown>).cache_write;
    next.cost = cost;
  } else {
    delete next.cost;
  }

  if (model.attachment) next.attachment = true;
  else delete next.attachment;
  if (model.reasoning) next.reasoning = true;
  else delete next.reasoning;
  if (model.temperature) next.temperature = true;
  else delete next.temperature;
  // V2-native capabilities (server maps legacy tool_call on read).
  if (!model.toolCall) {
    next.capabilities = { ...(next.capabilities || {}), tools: false };
  } else if (next.capabilities && typeof next.capabilities === 'object') {
    const { tools, ...rest } = next.capabilities as { tools?: boolean } & Record<string, unknown>;
    if (Object.keys(rest).length > 0) next.capabilities = rest as typeof next.capabilities;
    else delete next.capabilities;
  }
  delete next.tool_call;
  if (model.experimental) next.experimental = true;
  else delete next.experimental;

  return next;
}

function buildProviderConfig(provider: ProviderDraft): ProviderConfig {
  const next: ProviderConfig = { ...(provider.source || {}) };
  // V2-native `package` (+aisdk: prefix for AI SDK runtimes).
  const npmValue = provider.npm.trim();
  const pkg = npmValue.startsWith('@ai-sdk/') && !npmValue.startsWith('aisdk:')
    ? `aisdk:${npmValue}`
    : npmValue;
  setTextField(next, "package", pkg);
  delete next.npm;
  // V1 `api` is an alias of the endpoint — fold into settings.baseURL.
  delete next.api;
  setTextField(next, "name", provider.name);

  const env = parseList(provider.envText);
  if (env.length > 0) next.env = env;
  else delete next.env;

  // V2-native `settings` (server maps legacy `options` on read).
  const settings: Record<string, unknown> = { ...((provider.source?.settings as Record<string, unknown>) || {}) };
  const baseURL = provider.baseURL.trim() || provider.api.trim();
  setTextField(settings, "apiKey", provider.apiKey);
  setTextField(settings, "baseURL", baseURL);
  const timeout = parsePositiveNumber(provider.timeout);
  const headerTimeout = parsePositiveNumber(provider.headerTimeout);
  const chunkTimeout = parsePositiveNumber(provider.chunkTimeout);
  if (provider.timeoutDisabled) settings.timeout = false;
  else if (timeout !== undefined) settings.timeout = timeout;
  else delete settings.timeout;
  if (provider.headerTimeoutDisabled) settings.headerTimeout = false;
  else if (headerTimeout !== undefined) settings.headerTimeout = headerTimeout;
  else delete settings.headerTimeout;
  if (provider.chunkTimeoutDisabled) settings.chunkTimeout = false;
  else if (chunkTimeout !== undefined) settings.chunkTimeout = chunkTimeout;
  else delete settings.chunkTimeout;
  if (provider.setCacheKey) settings.setCacheKey = true;
  else delete settings.setCacheKey;
  if (Object.keys(settings).length > 0) next.settings = settings as ProviderConfig['settings'];
  else delete next.settings;
  delete next.options;

  const models: NonNullable<ProviderConfig["models"]> = {};
  for (const model of provider.models) {
    const key = model.key.trim();
    if (!key) continue;
    models[key] = buildModelConfig(model);
  }
  if (Object.keys(models).length > 0) next.models = models;

  return next;
}

function getDefaultModel(config: OpencodeConfig) {
  return typeof config.model === "string" ? config.model : "";
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

export function CustomProviderModelEditor({ config, onSave }: CustomProviderModelEditorProps) {
  const t = useTranslations("settings.customProviders");
  const [providers, setProviders] = useState(() => providerDraftsFromConfig(config));
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const [selectedModelIndexes, setSelectedModelIndexes] = useState<Record<number, number>>({});
  const [defaultModel, setDefaultModel] = useState(() => getDefaultModel(config));
  const [smallModel, setSmallModel] = useState(() => config.small_model || "");
  const [saving, setSaving] = useState(false);

  const providerIds = providers.map((provider) => provider.id.trim());
  const duplicateProviderIds = useMemo(() => duplicateValues(providerIds), [providerIds]);
  const hasProviderIdError = providerIds.some((id) => !id) || duplicateProviderIds.size > 0;
  const hasModelKeyError = providers.some((provider) => {
    const keys = provider.models.map((model) => model.key.trim());
    return keys.some((key) => !key) || duplicateValues(keys).size > 0;
  });

  const updateProvider = (index: number, next: Partial<ProviderDraft>) => {
    setProviders((current) => current.map((provider, i) => (i === index ? { ...provider, ...next } : provider)));
  };

  const updateModel = (providerIndex: number, modelIndex: number, next: Partial<ModelDraft>) => {
    setProviders((current) =>
      current.map((provider, i) => {
        if (i !== providerIndex) return provider;
        return {
          ...provider,
          models: provider.models.map((model, j) => (j === modelIndex ? { ...model, ...next } : model)),
        };
      })
    );
  };

  const addProvider = () => {
    const nextIndex = providers.length;
    setProviders((current) => [...current, emptyProvider(`custom-provider-${nextIndex + 1}`)]);
    setSelectedProviderIndex(nextIndex);
  };

  const addModel = (providerIndex: number) => {
    const nextModelIndex = providers[providerIndex]?.models.length || 0;
    setProviders((current) =>
      current.map((provider, index) => {
        if (index !== providerIndex) return provider;
        return {
          ...provider,
          models: [...provider.models, emptyModel(`model-${provider.models.length + 1}`)],
        };
      })
    );
    setSelectedModelIndexes((current) => ({ ...current, [providerIndex]: nextModelIndex }));
  };

  const removeProvider = (providerIndex: number) => {
    setProviders((current) => current.filter((_, index) => index !== providerIndex));
    setSelectedProviderIndex((current) => Math.min(current, Math.max(0, providers.length - 2)));
  };

  const removeModel = (providerIndex: number, modelIndex: number) => {
    setProviders((current) =>
      current.map((provider, index) => {
        if (index !== providerIndex) return provider;
        return {
          ...provider,
          models: provider.models.filter((_, i) => i !== modelIndex),
        };
      })
    );
    setSelectedModelIndexes((current) => ({
      ...current,
      [providerIndex]: Math.min(current[providerIndex] || 0, Math.max(0, (providers[providerIndex]?.models.length || 1) - 2)),
    }));
  };

  const resetFromConfig = () => {
    setProviders(providerDraftsFromConfig(config));
    setSelectedProviderIndex(0);
    setSelectedModelIndexes({});
    setDefaultModel(getDefaultModel(config));
    setSmallModel(config.small_model || "");
  };

  // Re-sync when the underlying config changes outside this editor (profile
  // switch, GitHub restore, cloud auto-sync pull, ...). The useState
  // initializers above only run once at mount, so without this the panel
  // would keep showing the previous config's providers and models.
  const lastSyncedConfigRef = useRef(config);
  useEffect(() => {
    if (lastSyncedConfigRef.current === config) return;
    lastSyncedConfigRef.current = config;
    setProviders(providerDraftsFromConfig(config));
    setSelectedProviderIndex(0);
    setSelectedModelIndexes({});
    setDefaultModel(getDefaultModel(config));
    setSmallModel(config.small_model || "");
  }, [config]);

  const handleSave = async () => {
    if (hasProviderIdError || hasModelKeyError) return;

    const providerConfig: Record<string, ProviderConfig> = {};
    for (const provider of providers) {
      const id = provider.id.trim();
      if (!id) continue;
      providerConfig[id] = buildProviderConfig(provider);
    }

    setSaving(true);
    try {
      await onSave({
        model: defaultModel.trim() || undefined,
        small_model: smallModel.trim() || undefined,
        providers: Object.keys(providerConfig).length > 0 ? providerConfig : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("defaultModel")}</Label>
          <Input
            value={defaultModel}
            onChange={(event) => setDefaultModel(event.target.value)}
            placeholder="anthropic/claude-sonnet-4-5"
          />
        </div>
        <div className="space-y-2">
          <Label>{t("smallModel")}</Label>
          <Input
            value={smallModel}
            onChange={(event) => setSmallModel(event.target.value)}
            placeholder="anthropic/claude-haiku-4-5"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-muted-foreground">
          {t("providerCount", { count: providers.length })}
        </div>
        <Button variant="outline" size="sm" onClick={addProvider}>
          <Plus className="h-4 w-4" />
          {t("addProvider")}
        </Button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2 rounded-md border bg-muted/20 p-2">
            {providers.map((provider, index) => (
              <button
                key={`${provider.id}-${index}`}
                className={cn(
                  "flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors hover:bg-background",
                  selectedProviderIndex === index && "bg-background font-medium"
                )}
                type="button"
                onClick={() => setSelectedProviderIndex(index)}
              >
                <span className="truncate">{provider.id.trim() || t("unnamedProvider")}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{provider.models.length}</span>
              </button>
            ))}
          </div>
          {providers.map((provider, providerIndex) => {
            if (providerIndex !== selectedProviderIndex) return null;
            const modelKeys = provider.models.map((model) => model.key.trim());
            const duplicateModelKeys = duplicateValues(modelKeys);
            const selectedModelIndex = selectedModelIndexes[providerIndex] || 0;

            return (
              <div key={providerIndex} className="min-w-0 rounded-md border bg-muted/20 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>{t("providerId")}</Label>
                      <Input
                        className={cn((!provider.id.trim() || duplicateProviderIds.has(provider.id.trim())) && "border-destructive")}
                        value={provider.id}
                        onChange={(event) => updateProvider(providerIndex, { id: event.target.value })}
                        placeholder="openai-compatible"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("displayName")}</Label>
                      <Input
                        value={provider.name}
                        onChange={(event) => updateProvider(providerIndex, { name: event.target.value })}
                        placeholder="OpenAI Compatible"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("api")}</Label>
                      <Input
                        value={provider.api}
                        onChange={(event) => updateProvider(providerIndex, { api: event.target.value })}
                        placeholder="openai-compatible"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeProvider(providerIndex)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>{t("baseUrl")}</Label>
                    <Input
                      value={provider.baseURL}
                      onChange={(event) => updateProvider(providerIndex, { baseURL: event.target.value })}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("apiKey")}</Label>
                    <Input
                      value={provider.apiKey}
                      onChange={(event) => updateProvider(providerIndex, { apiKey: event.target.value })}
                      placeholder="{env:EXAMPLE_API_KEY}"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("npm")}</Label>
                    <Input
                      value={provider.npm}
                      onChange={(event) => updateProvider(providerIndex, { npm: event.target.value })}
                      placeholder="@ai-sdk/openai-compatible"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("env")}</Label>
                    <Input
                      value={provider.envText}
                      onChange={(event) => updateProvider(providerIndex, { envText: event.target.value })}
                      placeholder="EXAMPLE_API_KEY"
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t("timeout")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={provider.timeout}
                      disabled={provider.timeoutDisabled}
                      onChange={(event) => updateProvider(providerIndex, { timeout: event.target.value })}
                      placeholder="300000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("headerTimeout")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={provider.headerTimeout}
                      disabled={provider.headerTimeoutDisabled}
                      onChange={(event) => updateProvider(providerIndex, { headerTimeout: event.target.value })}
                      placeholder="30000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("chunkTimeout")}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={provider.chunkTimeout}
                      disabled={provider.chunkTimeoutDisabled}
                      onChange={(event) => updateProvider(providerIndex, { chunkTimeout: event.target.value })}
                      placeholder="30000"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 rounded-md bg-background p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={provider.timeoutDisabled}
                      onCheckedChange={(checked) => updateProvider(providerIndex, { timeoutDisabled: checked })}
                    />
                    {t("disableTimeout")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={provider.headerTimeoutDisabled}
                      onCheckedChange={(checked) => updateProvider(providerIndex, { headerTimeoutDisabled: checked })}
                    />
                    {t("disableHeaderTimeout")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={provider.chunkTimeoutDisabled}
                      onCheckedChange={(checked) => updateProvider(providerIndex, { chunkTimeoutDisabled: checked })}
                    />
                    {t("disableChunkTimeout")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={provider.setCacheKey}
                      onCheckedChange={(checked) => updateProvider(providerIndex, { setCacheKey: checked })}
                    />
                    {t("setCacheKey")}
                  </label>
                </div>

                <div className="mt-5 space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label>{t("models")}</Label>
                    <Button variant="outline" size="sm" onClick={() => addModel(providerIndex)}>
                      <Plus className="h-4 w-4" />
                      {t("addModel")}
                    </Button>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {provider.models.map((model, modelIndex) => (
                      <button
                        key={`${model.key}-${modelIndex}`}
                        className={cn(
                          "shrink-0 rounded border px-3 py-1.5 text-xs transition-colors hover:bg-muted",
                          selectedModelIndex === modelIndex && "bg-muted font-medium"
                        )}
                        type="button"
                        onClick={() => setSelectedModelIndexes((current) => ({ ...current, [providerIndex]: modelIndex }))}
                      >
                        {model.key.trim() || t("unnamedModel")}
                      </button>
                    ))}
                  </div>

                  {provider.models.map((model, modelIndex) => (
                    modelIndex === selectedModelIndex && (
                    <div key={modelIndex} className="rounded-md border bg-background p-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <div className="space-y-2">
                          <Label>{t("modelKey")}</Label>
                          <Input
                            className={cn((!model.key.trim() || duplicateModelKeys.has(model.key.trim())) && "border-destructive")}
                            value={model.key}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { key: event.target.value })}
                            placeholder="model-id"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("modelId")}</Label>
                          <Input
                            value={model.id}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { id: event.target.value })}
                            placeholder="vendor/model-id"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("modelName")}</Label>
                          <Input
                            value={model.name}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { name: event.target.value })}
                            placeholder="Model name"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mt-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeModel(providerIndex, modelIndex)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>{t("contextLimit")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={model.contextLimit}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { contextLimit: event.target.value })}
                            placeholder="200000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("inputLimit")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={model.inputLimit}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { inputLimit: event.target.value })}
                            placeholder="200000"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("outputLimit")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={model.outputLimit}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { outputLimit: event.target.value })}
                            placeholder="8192"
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label>{t("inputCost")}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.000001"
                            value={model.inputCost}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { inputCost: event.target.value })}
                            placeholder="3"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("outputCost")}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.000001"
                            value={model.outputCost}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { outputCost: event.target.value })}
                            placeholder="15"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("cacheReadCost")}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.000001"
                            value={model.cacheReadCost}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { cacheReadCost: event.target.value })}
                            placeholder="0.3"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t("cacheWriteCost")}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.000001"
                            value={model.cacheWriteCost}
                            onChange={(event) => updateModel(providerIndex, modelIndex, { cacheWriteCost: event.target.value })}
                            placeholder="3.75"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-4 rounded-md bg-muted/30 p-3">
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={model.attachment}
                            onCheckedChange={(checked) => updateModel(providerIndex, modelIndex, { attachment: checked })}
                          />
                          {t("attachment")}
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={model.reasoning}
                            onCheckedChange={(checked) => updateModel(providerIndex, modelIndex, { reasoning: checked })}
                          />
                          {t("reasoning")}
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={model.temperature}
                            onCheckedChange={(checked) => updateModel(providerIndex, modelIndex, { temperature: checked })}
                          />
                          {t("temperature")}
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={model.toolCall}
                            onCheckedChange={(checked) => updateModel(providerIndex, modelIndex, { toolCall: checked })}
                          />
                          {t("toolCall")}
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={model.experimental}
                            onCheckedChange={(checked) => updateModel(providerIndex, modelIndex, { experimental: checked })}
                          />
                          {t("experimental")}
                        </label>
                      </div>
                    </div>
                    )
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-muted-foreground">
          {hasProviderIdError || hasModelKeyError ? t("validationError") : t("ready")}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={resetFromConfig}>
            {t("reset")}
          </Button>
          <Button onClick={handleSave} disabled={saving || hasProviderIdError || hasModelKeyError}>
            {saving ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
