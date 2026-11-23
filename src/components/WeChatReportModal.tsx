import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type {
  PlayerStanding,
  ScheduleFairnessReport,
  TournamentFormat,
  TournamentState,
} from '../types/tournament';
import {
  buildPosterCopyPayload,
  type AnalyzeApiResponse,
  type PosterCopyResult,
} from '../utils/aiAnalysis';
import { computeTournamentAwards, getPlayerHonorProfile } from '../utils/awardsEngine';
import { resolvePlayerAvatar } from '../utils/avatarUtils';
import {
  DEFAULT_POSTER_HERO_URL,
  getDefaultPosterCopy,
  renderPersonalSpotlightPosterToDataUrl,
  renderPosterToDataUrl,
  type PosterTheme,
} from '../utils/posterCanvas';
import { formatWeChatReport } from '../utils/scheduler';

interface WeChatReportModalProps {
  open: boolean;
  state: TournamentState;
  standings: PlayerStanding[];
  fairness: ScheduleFairnessReport;
  heroImageUrl?: string;
  avatarsByName?: Record<string, string>;
  initialSpotlightPlayerId?: string | null;
  onClose: () => void;
}

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  classic: '经典全员转',
  balanced: '水平均衡转',
  mixed: '混双优选转',
  mexicano: '胜者升场制',
  ai_smart: 'AI 智适应排阵',
};

const POSTER_THEMES: Array<{
  id: PosterTheme;
  label: string;
  swatch: string;
}> = [
  { id: 'magazine', label: '轻转画报', swatch: 'bg-[#F7F3EC] border-[#D97757]' },
  { id: 'polaroid', label: '氛围拍立得', swatch: 'bg-[#FAF7F1] border-[#1C1917]' },
  { id: 'obsidian_gold', label: '黑金典藏', swatch: 'bg-[#0F1115] border-[#E8C988]' },
];

function MiniAvatar({
  name,
  src,
  sizeClass = 'w-8 h-8 text-xs',
  ringClass = '',
  fallbackBg = 'bg-[#27272A] text-white',
}: {
  name: string;
  src?: string;
  sizeClass?: string;
  ringClass?: string;
  fallbackBg?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-full object-cover shrink-0 ${ringClass}`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold shrink-0 ${fallbackBg} ${ringClass}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function WeChatReportModal({
  open,
  state,
  standings,
  fairness,
  heroImageUrl,
  avatarsByName = {},
  initialSpotlightPlayerId = null,
  onClose,
}: WeChatReportModalProps) {
  const resolvedHeroUrl = heroImageUrl || DEFAULT_POSTER_HERO_URL;
  const [mode, setMode] = useState<'poster' | 'personal' | 'text'>('poster');
  const [theme, setTheme] = useState<PosterTheme>('magazine');
  const [spotlightPlayerId, setSpotlightPlayerId] = useState<string | null>(
    initialSpotlightPlayerId ?? standings[0]?.player.id ?? null
  );
  const [aiCopy, setAiCopy] = useState<PosterCopyResult | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialSpotlightPlayerId) {
      setSpotlightPlayerId(initialSpotlightPlayerId);
      setMode('personal');
    } else {
      setMode('poster');
      if (!spotlightPlayerId && standings[0]) {
        setSpotlightPlayerId(standings[0].player.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSpotlightPlayerId]);

  const awards = useMemo(
    () => computeTournamentAwards(state, standings),
    [state, standings]
  );

  const playerMap = useMemo(
    () => new Map(state.players.map((p) => [p.id, p])),
    [state.players]
  );

  const spotlightStanding = useMemo(
    () =>
      standings.find((s) => s.player.id === spotlightPlayerId) ??
      standings[0] ??
      null,
    [standings, spotlightPlayerId]
  );

  const spotlightHonor = useMemo(
    () => (spotlightStanding ? getPlayerHonorProfile(spotlightStanding, awards) : null),
    [spotlightStanding, awards]
  );

  const bestPartnerForSpotlight = useMemo(() => {
    if (!spotlightStanding) return null;
    const stats = new Map<string, { id: string; name: string; wins: number; games: number }>();
    for (const r of state.rounds) {
      for (const m of r.matches) {
        if (m.status !== 'completed' || m.scoreA === null || m.scoreB === null) continue;
        const inA = m.teamA.includes(spotlightStanding.player.id);
        const inB = m.teamB.includes(spotlightStanding.player.id);
        if (!inA && !inB) continue;
        const team = inA ? m.teamA : m.teamB;
        const won = inA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA;
        const pid = team.find((id) => id !== spotlightStanding.player.id);
        if (!pid) continue;
        const prev = stats.get(pid) ?? {
          id: pid,
          name: playerMap.get(pid)?.name ?? '球友',
          wins: 0,
          games: 0,
        };
        prev.games += 1;
        if (won) prev.wins += 1;
        stats.set(pid, prev);
      }
    }
    return (
      Array.from(stats.values()).sort((a, b) => b.wins - a.wins || b.games - a.games)[0] ??
      null
    );
  }, [spotlightStanding, state.rounds, playerMap]);

  if (!open) return null;

  const reportText = formatWeChatReport(state, standings);
  const completedMatches = state.rounds.reduce(
    (sum, r) => sum + r.matches.filter((m) => m.status === 'completed').length,
    0
  );
  const totalMatches = state.rounds.reduce((sum, r) => sum + r.matches.length, 0);
  const mvp = standings[0] ?? null;
  const bestDuoAward = awards.find((a) => a.id === 'best_duo') ?? null;
  const activeCopy = aiCopy ?? getDefaultPosterCopy(state, standings);
  const dateStr = (state.sessionDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '.');

  const getAvatar = (row: PlayerStanding) =>
    resolvePlayerAvatar(row.player.name, row.player.avatarUrl, avatarsByName);

  const handleGenerateAiCopy = async () => {
    setCopyLoading(true);
    setCopyError(null);
    try {
      const payload = buildPosterCopyPayload(state, standings, fairness);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'poster_copy',
          context: payload,
        }),
      });
      const json = (await res.json()) as AnalyzeApiResponse<PosterCopyResult>;
      if (!res.ok || !json.ok || !json.data) {
        setCopyError(json.error || 'AI 文案生成失败，请稍后重试');
        return;
      }
      setAiCopy(json.data);
    } catch {
      setCopyError('网络异常，无法连接 DeepSeek');
    } finally {
      setCopyLoading(false);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
    } catch {
      const el = document.createElement('textarea');
      el.value = reportText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleDownloadPoster = async () => {
    setDownloading(true);
    try {
      let dataUrl = '';
      let fileName = `${state.config.title.replace(/\s+/g, '_')}_${theme}.png`;

      if (mode === 'personal' && spotlightStanding) {
        dataUrl = await renderPersonalSpotlightPosterToDataUrl(
          state,
          spotlightStanding,
          awards,
          resolvedHeroUrl,
          avatarsByName
        );
        fileName = `${spotlightStanding.player.name}_高光荣耀卡.png`;
      } else {
        dataUrl = await renderPosterToDataUrl(
          state,
          standings,
          fairness,
          theme,
          activeCopy,
          resolvedHeroUrl,
          avatarsByName
        );
      }

      if (!dataUrl) return;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      link.click();
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2200);
    } finally {
      setDownloading(false);
    }
  };

  const medalHex =
    spotlightStanding?.rank === 1
      ? '#F5C451'
      : spotlightStanding?.rank === 2
      ? '#E2E8F0'
      : spotlightStanding?.rank === 3
      ? '#E59B6B'
      : '#F5C451';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg theme-glass-strong text-[#F8FAFC] rounded-t-3xl md:rounded-3xl p-4 sm:p-5 pb-safe shadow-2xl border max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="md:hidden w-10 h-1.5 bg-white/25 rounded-full mx-auto mb-3"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-3">
          <div>
            <h2 id="report-modal-title" className="text-base sm:text-lg font-extrabold text-white">
              朋友圈荣耀画报工坊
            </h2>
            <p className="text-xs text-white/65">
              全场群像画报 · 球手个人高光卡 · 2× 高清一键存图
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭战报窗口"
            className="min-h-[42px] min-w-[42px] -mr-2 flex items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Tab Mode Switcher: 全场画报 | 个人高光卡 | 微信群文字 */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-black/35 border border-white/10 rounded-xl mb-3">
          <button
            type="button"
            onClick={() => setMode('poster')}
            className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
              mode === 'poster' ? 'theme-accent-bg' : 'text-white/70 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>全场画报</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('personal')}
            className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
              mode === 'personal' ? 'theme-accent-bg' : 'text-white/70 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>个人高光卡</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
              mode === 'text' ? 'theme-accent-bg' : 'text-white/70 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>群文字</span>
          </button>
        </div>

        {/* Sub-Toolbar for Group Poster Styles */}
        {mode === 'poster' && (
          <div className="flex items-center justify-between gap-1.5 mb-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 shrink-0">
              {POSTER_THEMES.map((t) => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    aria-pressed={active}
                    className={`min-h-[34px] px-2 rounded-xl text-[11px] font-semibold border flex items-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                      active
                        ? 'bg-white/15 border-[var(--theme-accent)] text-white font-bold'
                        : 'bg-black/30 border-white/10 text-white/70 hover:text-white'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`w-2 h-2 rounded-full border shrink-0 ${t.swatch}`}
                    />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleGenerateAiCopy}
              disabled={copyLoading}
              className="min-h-[34px] px-2 rounded-xl bg-white/10 border border-white/20 text-white text-[11px] font-bold hover:bg-white/20 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            >
              {copyLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3 h-3 theme-accent-text" aria-hidden="true" />
              )}
              <span>{copyLoading ? '撰写中' : aiCopy ? '换金句' : 'AI 金句'}</span>
            </button>
          </div>
        )}

        {/* Player Selector Strip for Personal Spotlight Card */}
        {mode === 'personal' && standings.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3 pb-0.5">
            {standings.map((row) => {
              const active = spotlightStanding?.player.id === row.player.id;
              return (
                <button
                  key={row.player.id}
                  type="button"
                  onClick={() => setSpotlightPlayerId(row.player.id)}
                  aria-pressed={active}
                  className={`min-h-[36px] pl-1.5 pr-2.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    active
                      ? 'bg-[#F5C451] text-[#111317] border-[#F5C451] font-bold'
                      : 'bg-black/30 border-white/12 text-white/80 hover:text-white'
                  }`}
                >
                  <MiniAvatar
                    name={row.player.name}
                    src={getAvatar(row)}
                    sizeClass="w-5 h-5 text-[10px]"
                  />
                  <span>
                    #{row.rank} {row.player.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {copyError && (
          <p role="alert" className="text-xs text-[#FFB0A0] mb-2">
            {copyError}
          </p>
        )}

        {/* Scrollable Poster Preview */}
        <div className="overflow-y-auto flex-1 pr-0.5">
          {mode === 'personal' && spotlightStanding && spotlightHonor ? (
            /* PERSONAL HIGHLIGHT HONOR CARD PREVIEW */
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-[#F5C451]/45 min-h-[520px] flex flex-col justify-between p-5 text-white">
              <img
                src={resolvedHeroUrl}
                alt="个人荣耀背景"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-[#0B0F18]/65 via-[#0B0F18]/78 to-[#090C13]/96"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-2.5 rounded-xl border border-[#F5C451]/30"
              />

              {/* Top Masthead */}
              <div className="relative z-10 flex items-center justify-between text-[10px] font-mono tracking-wider">
                <span className="text-white/80 font-bold">PLAYER SPOTLIGHT · 个人高光卡</span>
                <span style={{ color: medalHex }} className="font-bold">
                  {dateStr}
                </span>
              </div>

              {/* Center Hero Portrait & Crown */}
              <div className="relative z-10 flex flex-col items-center text-center my-4">
                <Crown className="w-6 h-6 mb-1.5" style={{ color: medalHex }} aria-hidden="true" />
                <div
                  className="w-24 h-24 rounded-full p-1 shadow-2xl"
                  style={{
                    background: `linear-gradient(135deg, ${medalHex}, rgba(255,255,255,0.35))`,
                  }}
                >
                  <img
                    src={getAvatar(spotlightStanding)}
                    alt={spotlightStanding.player.name}
                    className="w-full h-full rounded-full object-cover border-2 border-[#0B0F18]"
                  />
                </div>
                <span
                  className="-mt-3 px-3 py-0.5 rounded-full text-[11px] font-mono font-extrabold text-[#0F172A] shadow-md"
                  style={{ backgroundColor: medalHex }}
                >
                  NO.{String(spotlightStanding.rank).padStart(2, '0')} · TOP
                </span>

                <div
                  className="mt-3 text-xs font-extrabold tracking-wide"
                  style={{ color: medalHex }}
                >
                  {spotlightHonor.primaryBadge} · {spotlightHonor.primaryTitle}
                </div>
                <h3 className="text-3xl font-extrabold text-white mt-0.5 tracking-tight">
                  {spotlightStanding.player.name}
                </h3>
                <p className="text-[11px] text-white/70 mt-0.5">
                  {state.config.title} · {FORMAT_LABELS[state.config.format]}
                </p>

                {/* Big Stats Triad */}
                <div className="mt-4 w-full grid grid-cols-3 divide-x divide-white/15 rounded-2xl bg-white/[0.08] border border-white/15 py-3.5 backdrop-blur-md">
                  <div>
                    <div className="font-score italic text-2xl font-extrabold text-white leading-none">
                      {spotlightStanding.wins}胜{spotlightStanding.losses}负
                    </div>
                    <div className="text-[10px] text-white/65 mt-1">本场战绩</div>
                  </div>
                  <div>
                    <div
                      className="font-score italic text-2xl font-extrabold leading-none"
                      style={{ color: medalHex }}
                    >
                      {spotlightStanding.played > 0
                        ? `${Math.round(spotlightStanding.winRate * 100)}%`
                        : '--'}
                    </div>
                    <div className="text-[10px] text-white/65 mt-1">本场胜率</div>
                  </div>
                  <div>
                    <div
                      className={`font-score italic text-2xl font-extrabold leading-none ${
                        spotlightStanding.pointDiff >= 0 ? 'text-[#34E39C]' : 'text-[#FF8A75]'
                      }`}
                    >
                      {spotlightStanding.pointDiff > 0
                        ? `+${spotlightStanding.pointDiff}`
                        : spotlightStanding.pointDiff}
                    </div>
                    <div className="text-[10px] text-white/65 mt-1">净胜分差</div>
                  </div>
                </div>

                {/* Best Partner Strip */}
                {bestPartnerForSpotlight && (
                  <div className="mt-3 w-full rounded-xl bg-white/[0.07] border border-white/12 px-3 py-2 flex items-center justify-between gap-2 text-left">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MiniAvatar
                        name={bestPartnerForSpotlight.name}
                        src={resolvePlayerAvatar(
                          bestPartnerForSpotlight.name,
                          playerMap.get(bestPartnerForSpotlight.id)?.avatarUrl,
                          avatarsByName
                        )}
                        sizeClass="w-8 h-8 text-xs"
                        ringClass="ring-1 ring-[#7CC2FF]"
                      />
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#7CC2FF] font-bold">本场默契拍档</div>
                        <div className="text-xs font-bold text-white truncate">
                          {bestPartnerForSpotlight.name}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-white/80 shrink-0">
                      搭档 {bestPartnerForSpotlight.wins}胜/{bestPartnerForSpotlight.games}场
                    </span>
                  </div>
                )}

                {/* Celebratory Quote */}
                <p className="mt-4 text-xs font-serif text-white/88 leading-relaxed px-2">
                  “{spotlightHonor.slogan}”
                </p>
              </div>

              {/* Footer Colophon */}
              <div className="relative z-10 pt-2.5 border-t border-white/15 flex items-center justify-between text-[10px]">
                <span className="text-white/65">{state.config.venue || '轻转匹克球俱乐部'}</span>
                <span className="font-mono font-bold" style={{ color: medalHex }}>
                  轻转匹克 · QINGZHUAN
                </span>
              </div>
            </div>
          ) : mode === 'poster' ? (
            <>
              {/* STYLE 1: WARM IVORY MAGAZINE COVER */}
              {theme === 'magazine' && (
                <div className="rounded-2xl bg-[#F7F3EC] text-[#18181B] p-4 sm:p-5 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-mono pb-2 border-b border-[#18181B]/12">
                    <span className="font-bold tracking-widest">THE PICKLEBALL JOURNAL</span>
                    <span className="text-[#78716C]">ISSUE {dateStr}</span>
                  </div>

                  {/* Rounded Full-Width Scenic Photo */}
                  <div className="relative h-56 rounded-2xl overflow-hidden shadow-md">
                    <img
                      src={resolvedHeroUrl}
                      alt="球场实景"
                      className="w-full h-full object-cover"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
                    />
                    <div className="absolute top-3 left-4 font-score text-3xl font-extrabold tracking-wide text-white/25 select-none">
                      CLUB EDITION
                    </div>
                    <div className="absolute inset-x-4 bottom-3.5 text-white">
                      <h3 className="text-xl font-extrabold leading-snug tracking-tight">
                        {activeCopy.coverTitle}
                      </h3>
                      <p className="text-[11px] text-white/85 mt-0.5">{activeCopy.coverSub}</p>
                    </div>
                  </div>

                  {/* Clean White Floating MVP Card with Circular Avatar */}
                  {mvp && (
                    <div className="rounded-2xl bg-white p-3.5 shadow-sm border border-[#18181B]/[0.06] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <MiniAvatar
                          name={mvp.player.name}
                          src={getAvatar(mvp)}
                          sizeClass="w-12 h-12 text-base"
                          ringClass="ring-2 ring-[#D97757] ring-offset-2 ring-offset-white"
                          fallbackBg="bg-[#1F2937] text-white"
                        />
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono font-bold text-[#D97757] tracking-wider">
                            CHAMPION · 本场 MVP
                          </div>
                          <div className="text-lg font-extrabold text-[#18181B] truncate leading-tight">
                            {mvp.player.name}
                          </div>
                          <div className="text-[11px] text-[#78716C] mt-0.5">
                            {mvp.wins}胜 {mvp.losses}负 · 胜率 {Math.round(mvp.winRate * 100)}%
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-score text-4xl font-extrabold text-[#18181B] leading-none">
                          {mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : mvp.pointDiff}
                        </div>
                        <div className="text-[10px] text-[#78716C] mt-0.5">净胜分差</div>
                      </div>
                    </div>
                  )}

                  {/* Best Duo Callout if available */}
                  {bestDuoAward && (
                    <div className="flex items-center justify-between text-[11px] px-1 text-[#57534E]">
                      <span>
                        <strong className="text-[#D97757]">灵魂拍档：</strong>
                        {bestDuoAward.playerNames.join(' × ')}
                      </span>
                      <span className="font-mono">{bestDuoAward.subtitle}</span>
                    </div>
                  )}

                  {/* Editorial Serif Pull Quote */}
                  <p className="text-xs text-[#57534E] leading-relaxed px-1 font-serif">
                    “{activeCopy.mvpQuote}”
                  </p>

                  {/* Airy Top-6 Honor Roll */}
                  <div className="pt-2.5 border-t border-[#18181B]/12 space-y-2.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#78716C]">
                      <span>HONOR ROLL · 积分荣誉榜</span>
                      <span>
                        {completedMatches}/{totalMatches} MATCHES · {state.config.targetScore}分制
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      {standings.slice(0, 6).map((row) => (
                        <div
                          key={row.player.id}
                          className="pb-2 border-b border-[#18181B]/[0.08] flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <MiniAvatar
                              name={row.player.name}
                              src={getAvatar(row)}
                              sizeClass="w-7 h-7 text-[11px]"
                              fallbackBg={
                                row.rank === 1
                                  ? 'bg-[#D97757] text-white'
                                  : 'bg-[#27272A] text-white'
                              }
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#18181B] truncate">
                                {row.rank}. {row.player.name}
                              </div>
                              <div className="text-[10px] font-mono text-[#78716C]">
                                {row.wins}W-{row.losses}L
                              </div>
                            </div>
                          </div>
                          <span
                            className={`font-score text-base font-extrabold shrink-0 ${
                              row.pointDiff > 0
                                ? 'text-[#15803D]'
                                : row.pointDiff < 0
                                ? 'text-[#C2410C]'
                                : 'text-[#78716C]'
                            }`}
                          >
                            {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[10px] text-[#78716C]">
                      <span>{state.config.venue || '轻转匹克球俱乐部'}</span>
                      <span className="font-mono font-bold text-[#18181B]">QINGZHUAN PICKLEBALL</span>
                    </div>
                  </div>
                </div>
              )}

              {/* STYLE 2: ARCHIVAL POLAROID FILM PRINT */}
              {theme === 'polaroid' && (
                <div className="rounded-2xl bg-[#FAF7F1] text-[#1C1917] p-4 shadow-2xl space-y-4 border border-black/10">
                  <div className="relative h-72 rounded-xl overflow-hidden">
                    <img
                      src={resolvedHeroUrl}
                      alt="拍立得球场实景"
                      className="w-full h-full object-cover"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25"
                    />
                    <div className="absolute top-3 inset-x-3.5 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-white/95 font-semibold tracking-wider">
                        MATCH DAY MEMORY
                      </span>
                      <span className="text-[#FCD34D] font-bold">{dateStr}</span>
                    </div>

                    {mvp && (
                      <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/90 backdrop-blur-md p-3 flex items-center justify-between gap-2.5 shadow-lg">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MiniAvatar
                            name={mvp.player.name}
                            src={getAvatar(mvp)}
                            sizeClass="w-10 h-10 text-sm"
                            ringClass="ring-2 ring-white"
                            fallbackBg="bg-[#1C1917] text-white"
                          />
                          <div className="min-w-0">
                            <div className="text-[9px] font-mono font-bold text-[#78716C]">
                              MVP OF THE SESSION
                            </div>
                            <div className="text-base font-extrabold text-[#1C1917] truncate">
                              {mvp.player.name}
                            </div>
                          </div>
                        </div>
                        <div className="font-score text-3xl font-extrabold text-[#1C1917] shrink-0">
                          {mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : mvp.pointDiff}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="px-1 space-y-1">
                    <h3 className="text-lg font-bold font-serif text-[#1C1917]">
                      {activeCopy.coverTitle}
                    </h3>
                    <p className="text-xs text-[#78716C] leading-relaxed">{activeCopy.mvpQuote}</p>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {standings.slice(0, 4).map((row, idx) => (
                      <div key={row.player.id} className="flex flex-col items-center text-center">
                        <MiniAvatar
                          name={row.player.name}
                          src={getAvatar(row)}
                          sizeClass="w-11 h-11 text-sm"
                          ringClass={
                            idx === 0
                              ? 'ring-2 ring-[#D97757] ring-offset-2 ring-offset-[#FAF7F1]'
                              : 'ring-1 ring-black/15'
                          }
                          fallbackBg={
                            idx === 0 ? 'bg-[#C2410C] text-white' : 'bg-[#292524] text-white'
                          }
                        />
                        <div className="text-xs font-bold text-[#1C1917] mt-1.5 truncate w-full">
                          {row.player.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#78716C]">
                          #{row.rank} · {row.pointDiff >= 0 ? `+${row.pointDiff}` : row.pointDiff}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2.5 border-t border-black/10 flex items-center justify-between text-[10px] text-[#78716C]">
                    <span>
                      {state.config.venue || '匹克球场'} · {FORMAT_LABELS[state.config.format]}
                    </span>
                    <span className="font-bold text-[#1C1917]">轻转匹克</span>
                  </div>
                </div>
              )}

              {/* STYLE 3: OBSIDIAN & CHAMPAGNE GOLD */}
              {theme === 'obsidian_gold' && (
                <div className="rounded-2xl bg-[#0F1115] text-white p-3.5 shadow-2xl border border-[#E8C988]/30">
                  <div className="rounded-xl border border-[#E8C988]/25 overflow-hidden">
                    <div className="relative pt-5 pb-12 px-4 text-center overflow-hidden">
                      <img
                        src={resolvedHeroUrl}
                        alt="球场实景"
                        className="absolute inset-0 w-full h-full object-cover opacity-55"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-b from-[#0F1115]/50 via-[#0F1115]/75 to-[#0F1115]"
                      />
                      <div className="relative z-10 space-y-1.5">
                        <div className="text-[10px] font-mono tracking-widest text-[#E8C988]">
                          CHAMPIONSHIP HONORS · {dateStr}
                        </div>
                        <h3 className="text-xl font-bold font-serif text-white">
                          {activeCopy.coverTitle}
                        </h3>
                        <p className="text-[11px] text-white/70">{activeCopy.coverSub}</p>
                      </div>
                    </div>

                    {mvp && (
                      <div className="-mt-9 relative z-10 flex flex-col items-center text-center px-5">
                        <MiniAvatar
                          name={mvp.player.name}
                          src={getAvatar(mvp)}
                          sizeClass="w-16 h-16 text-xl"
                          ringClass="ring-2 ring-[#E8C988] ring-offset-2 ring-offset-[#0F1115]"
                          fallbackBg="bg-[#1C1F26] text-[#E8C988]"
                        />
                        <div className="text-[10px] font-mono tracking-widest text-[#E8C988] mt-2.5">
                          NO.01 · MVP CHAMPION
                        </div>
                        <div className="text-2xl font-extrabold text-white mt-0.5">
                          {mvp.player.name}
                        </div>
                        <div className="text-[11px] font-mono text-[#E8C988]/90 mt-1">
                          {mvp.wins}W-{mvp.losses}L · NET{' '}
                          {mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : mvp.pointDiff} ·{' '}
                          {Math.round(mvp.winRate * 100)}% WIN
                        </div>
                      </div>
                    )}

                    <div className="mx-8 my-3.5 border-t border-[#E8C988]/25" />

                    <p className="px-6 text-center text-xs font-serif text-white/75 leading-relaxed">
                      “{activeCopy.mvpQuote}”
                    </p>

                    <div className="p-4 pt-3.5 divide-y divide-white/[0.08]">
                      {standings.slice(0, 5).map((row, idx) => (
                        <div
                          key={row.player.id}
                          className="py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`font-score text-lg font-extrabold w-5 ${
                                idx === 0 ? 'text-[#E8C988]' : 'text-white/40'
                              }`}
                            >
                              {String(row.rank).padStart(2, '0')}
                            </span>
                            <MiniAvatar
                              name={row.player.name}
                              src={getAvatar(row)}
                              sizeClass="w-7 h-7 text-[11px]"
                              ringClass={
                                idx === 0 ? 'ring-1 ring-[#E8C988]' : 'ring-1 ring-white/20'
                              }
                              fallbackBg="bg-[#1F242D] text-white"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {row.player.name}
                              </div>
                              <div className="text-[10px] font-mono text-white/50">
                                {row.wins}W-{row.losses}L · DUPR {row.player.rating.toFixed(1)}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`font-score text-lg font-extrabold shrink-0 ${
                              row.pointDiff > 0
                                ? 'text-[#E8C988]'
                                : row.pointDiff < 0
                                ? 'text-[#F87171]'
                                : 'text-white/50'
                            }`}
                          >
                            {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pb-3.5 text-center text-[10px] font-mono text-[#E8C988]/70">
                      {completedMatches}/{totalMatches} MATCHES · {state.config.targetScore} PTS ·
                      轻转匹克
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <pre className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs sm:text-sm font-mono leading-relaxed text-white/90 whitespace-pre-wrap select-all">
              {reportText}
            </pre>
          )}
        </div>

        {/* Bottom Primary CTA Row */}
        <div className="pt-4 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleDownloadPoster}
            disabled={downloading}
            className="min-h-[46px] px-3 rounded-xl theme-accent-bg text-sm font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>渲染高清图中…</span>
              </>
            ) : downloaded ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>已保存 2× 高清图</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>
                  {mode === 'personal' ? '保存个人高光卡' : '保存 2× 全场画报'}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="min-h-[46px] px-3 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-semibold hover:bg-white/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#34E39C]" aria-hidden="true" />
                <span>已复制文字</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                <span>复制群文字战报</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
