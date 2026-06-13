"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { getSourceFiles, getSourceFile, saveSourceFile } from "@/lib/api";
import { useReload } from "@/components/reload-context";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight, ChevronDown, File, Folder } from "@nsmr/pixelart-react";

interface FileNode {
  name: string;
  isDirectory: boolean;
  path: string;
  children?: FileNode[];
  expanded?: boolean;
}

export default function SourcePage() {
  const params = useParams();
  const name = params.name as string;
  const t = useTranslations('customHarness');
  const { triggerReload } = useReload();
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await getSourceFiles(name);
        if (data.ok) {
          setFileTree(data.files);
        }
      } catch {
        toast.error(t('loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name, t]);

  const handleToggleExpand = async (nodePath: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(nodePath)) {
      newExpanded.delete(nodePath);
    } else {
      newExpanded.add(nodePath);
      // Load children if not already loaded
      const updatedTree = await loadChildren(fileTree, nodePath);
      setFileTree(updatedTree);
    }
    setExpandedPaths(newExpanded);
  };

  async function loadChildren(nodes: FileNode[], targetPath: string): Promise<FileNode[]> {
    return Promise.all(nodes.map(async (node) => {
      if (node.path === targetPath && node.isDirectory && !node.children) {
        try {
          const data = await getSourceFiles(name, node.path);
          if (data.ok) {
            return { ...node, children: data.files };
          }
        } catch (err) {
          console.error('Failed to load children:', err);
        }
      }
      if (node.children) {
        return { ...node, children: await loadChildren(node.children, targetPath) };
      }
      return node;
    }));
  }

  const handleSelectFile = async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const data = await getSourceFile(name, filePath);
      if (data.ok) {
        setFileContent(data.content);
      }
    } catch {
      toast.error(t('loadFailed'));
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    try {
      setSaving(true);
      await saveSourceFile(name, selectedFile, fileContent);
      toast.success(t('saved'));
      triggerReload();
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedPaths.has(node.path);
      
      if (node.isDirectory) {
        return (
          <div key={node.path} style={{ marginLeft: depth * 16 }}>
            <button
              type="button"
              onClick={() => handleToggleExpand(node.path)}
              className="flex items-center gap-1 py-1 px-2 rounded hover:bg-accent w-full text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Folder className="h-4 w-4 text-blue-500" />
              <span className="text-sm">{node.name}</span>
            </button>
            {isExpanded && node.children && (
              <div>{renderFileTree(node.children, depth + 1)}</div>
            )}
          </div>
        );
      }

      return (
        <button
          type="button"
          key={node.path}
          onClick={() => handleSelectFile(node.path)}
          style={{ marginLeft: depth * 16 }}
          className={`flex items-center gap-1 py-1 px-2 rounded w-full text-left ${
            selectedFile === node.path
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-accent'
          }`}
        >
          <span className="w-4" />
          <File className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{node.name}</span>
        </button>
      );
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t('source')}</h2>
        <p className="text-muted-foreground">{t('sourceDescription')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">{t('fileTree')}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto max-h-[600px]">
              <div className="space-y-1">
                {fileTree.length > 0 ? (
                  renderFileTree(fileTree)
                ) : (
                  <p className="text-sm text-muted-foreground">{t('noSourceFiles')}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedFile ? (
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-mono">{selectedFile}</CardTitle>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? t('saving') : t('save')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  rows={24}
                  className="font-mono text-sm"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground">{t('selectFile')}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
