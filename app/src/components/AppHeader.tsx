import { ExternalLink, Github, Info, Languages, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { GITHUB_ISSUES_URL, GITHUB_REPO_URL } from '@/lib/siteLinks';

export function AppHeader() {
  const { t, lang, setLang } = useI18n();

  return (
    <header className="grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-[var(--ws-border)] bg-white/45 px-2 py-1.5 sm:px-5">
      <div aria-hidden="true" />

      <div className="flex min-w-0 items-center justify-center gap-2.5">
        <img
          src={`${import.meta.env.BASE_URL}favicon-64.png`}
          alt=""
          draggable={false}
          className="ws-brand-image size-8 shrink-0 rounded-md object-cover shadow-sm sm:size-9"
        />
        <h1 className="ws-brand-wordmark truncate text-[23px] leading-none sm:text-[28px]">
          WaveSketch
        </h1>
      </div>

      <div className="flex shrink-0 items-center justify-self-end gap-1.5 sm:gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="border-[var(--ws-border)] bg-[var(--ws-card)]" aria-label={t('aboutButton')}>
              <Info className="size-4" />
              <span className="hidden sm:inline">{t('aboutButton')}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="overflow-hidden border-[var(--ws-border)] bg-[var(--ws-cream)] p-0 sm:max-w-xl">
            <div className="h-1 bg-primary" />
            <div className="p-6 sm:p-7">
              <DialogHeader>
                <div className="mb-4 flex min-w-0 items-center gap-3 pr-8">
                  <img
                    src={`${import.meta.env.BASE_URL}favicon-64.png`}
                    alt=""
                    draggable={false}
                    className="ws-brand-image size-11 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0">
                    <div className="ws-display truncate text-xl font-bold tracking-[0.04em] text-[var(--ws-ink)]">WaveSketch</div>
                    <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Open waveform workspace</div>
                  </div>
                </div>
                <DialogTitle className="ws-display text-3xl font-semibold text-[var(--ws-ink)]">
                  {t('aboutTitle')}
                </DialogTitle>
                <DialogDescription className="max-w-lg pt-1 leading-6 text-[var(--ws-muted)]">
                  {t('aboutDescription')}
                </DialogDescription>
              </DialogHeader>

              <div className="my-6 grid gap-3 sm:grid-cols-3">
                {[t('aboutFeatureDraw'), t('aboutFeatureCompute'), t('aboutFeatureExport')].map((item, index) => (
                  <div key={item} className="rounded-xl border border-[var(--ws-border)] bg-[var(--ws-card)] p-3">
                    <div className="ws-display mb-2 text-lg font-bold text-primary">0{index + 1}</div>
                    <div className="text-sm font-medium text-[var(--ws-ink)]">{item}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ws-border)] pt-4">
                <div className="flex shrink-0 items-center gap-1.5">
                  <img
                    src={`${import.meta.env.BASE_URL}chestnut-closed.png`}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    className="ws-mascot-image size-8 object-contain"
                  />
                  <Button asChild size="sm">
                    <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                      <Github className="size-4" />GitHub<ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">
                    <MessageSquareText className="size-4" />{t('linkFeedback')}
                  </a>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="border-[var(--ws-border)] bg-[var(--ws-card)]"
          title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
        >
          <Languages className="size-4" />
          {lang === 'zh' ? 'EN' : '中文'}
        </Button>
      </div>
    </header>
  );
}
