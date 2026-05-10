"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoBox } from "@nsmr/pixelart-react";
import type { PageHelpDialogProps } from "@/components/page-help";
import { useTranslations } from "next-intl";

export function PageHelpDialog({ open, onOpenChange, page }: PageHelpDialogProps) {
  const t = useTranslations('help');

  const helpContent: Record<string, { title: string; description: string; usage: string; tips?: string[] }> = {
    agents: {
      title: t('agents.title'),
      description: t('agents.description'),
      usage: t('agents.usage'),
      tips: [t('agents.tip0'), t('agents.tip1'), t('agents.tip2')]
    },
    mcp: {
      title: t('mcp.title'),
      description: t('mcp.description'),
      usage: t('mcp.usage'),
      tips: [t('mcp.tip0'), t('mcp.tip1')]
    },
    skills: {
      title: t('skills.title'),
      description: t('skills.description'),
      usage: t('skills.usage'),
      tips: [t('skills.tip0'), t('skills.tip1')]
    },
    plugins: {
      title: t('plugins.title'),
      description: t('plugins.description'),
      usage: t('plugins.usage'),
      tips: [t('plugins.tip0'), t('plugins.tip1')]
    },
    commands: {
      title: t('commands.title'),
      description: t('commands.description'),
      usage: t('commands.usage'),
      tips: [t('commands.tip0'), t('commands.tip1')]
    },
    auth: {
      title: t('auth.title'),
      description: t('auth.description'),
      usage: t('auth.usage'),
      tips: [t('auth.tip0'), t('auth.tip1')]
    },
    settings: {
      title: t('settings.title'),
      description: t('settings.description'),
      usage: t('settings.usage'),
      tips: [t('settings.tip0'), t('settings.tip1')]
    },
    profiles: {
      title: t('profiles.title'),
      description: t('profiles.description'),
      usage: t('profiles.usage'),
      tips: [t('profiles.tip0'), t('profiles.tip1')]
    },
    quickstart: {
      title: t('quickstart.title'),
      description: t('quickstart.description'),
      usage: t('quickstart.usage'),
      tips: [t('quickstart.tip0'), t('quickstart.tip1')]
    },
    usage: {
      title: t('usage.title'),
      description: t('usage.description'),
      usage: t('usage.usage'),
      tips: [t('usage.tip0'), t('usage.tip1')]
    },
    logs: {
      title: t('logs.title'),
      description: t('logs.description'),
      usage: t('logs.usage'),
      tips: [t('logs.tip0'), t('logs.tip1')]
    },
    rules: {
      title: t('rules.title'),
      description: t('rules.description'),
      usage: t('rules.usage'),
      tips: [t('rules.tip0'), t('rules.tip1')]
    },
    config: {
      title: t('config.title'),
      description: t('config.description'),
      usage: t('config.usage'),
      tips: [t('config.tip0'), t('config.tip1')]
    },
    editor: {
      title: t('editor.title'),
      description: t('editor.description'),
      usage: t('editor.usage'),
      tips: [t('editor.tip0'), t('editor.tip1'), t('editor.tip2')]
    }
  };

  const content = helpContent[page] || {
    title: page,
    description: t('noContent'),
    usage: "",
    tips: []
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <InfoBox className="h-5 w-5 text-primary" />
            {content.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('sectionLabels.whatIsThis')}</h3>
            <p className="text-sm text-muted-foreground">{content.description}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('sectionLabels.howToUse')}</h3>
            <p className="text-sm text-muted-foreground">{content.usage}</p>
          </div>

          {content.tips && content.tips.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('sectionLabels.tips')}</h3>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                {content.tips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="pt-2 border-t">
            <a 
              href="https://github.com/Microck/opencode-studio#readme" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {t('sectionLabels.viewDocs')}
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
