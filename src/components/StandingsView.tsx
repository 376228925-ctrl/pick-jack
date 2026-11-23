import { useMemo, useState } from 'react';
import {
  Award,
  ChevronRight,
  Crown,
  Flame,
  HeartHandshake,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type {
  Player,
  PlayerStanding,
  ScheduleFairnessReport,
  TournamentState,
} from '../types/tournament';
import { computeTournamentAwards, type HonorAwardId } from '../utils/awardsEngine';
import { resolvePlayerAvatar } from '../utils/avatarUtils';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import { PlayerDetailContent, PlayerDetailSheet } from './PlayerDetailSheet';

interface StandingsViewProps {
  state: TournamentState;
  standings: PlayerStanding[];
  fairness: ScheduleFairnessReport;
  playerMap: Map<string, Player>;
  avatarsByName?: Record<string, string>;
  completedMatches: number;
  totalMatches: number;
  onOpenReport: () => void;
  onOpenPlayerPoster: (playerId: string) => void;
}

function AwardIcon({ id, color }: { id: HonorAwardId; color: string }) {
  const style = { color };
  switch (id) {
    case 'mvp':
      return <Crown className="w-4 h-4" style={style} aria-hidden="true" />;
    case 'best_duo':
      return <HeartHandshake className="w-4 h-4" style={style} aria-hidden="true" />;
    case 'clutch_king':
      return <Zap className="w-4 h-4" style={style} aria-hidden="true" />;
    case 'scoring_machine':
      return <Flame className="w-4 h-4" style={style} aria-hidden="true" />;
    case 'iron_wall':
      return <Shield className="w-4 h-4" style={style} aria-hidden="true" />;
    case 'rising_star':
      return <TrendingUp className="w-4 h-4" style={style} aria-hidden="true" />;
  }
}

export function StandingsView({
  state,
  standings,
  fairness,
  playerMap,
  avatarsByName,
  completedMatches,
  totalMatches,
  onOpenReport,
  onOpenPlayerPoster,
}: StandingsViewProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    standings[0]?.player.id ?? null
  );
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const selectedStanding =
    standings.find((s) => s.player.id === selectedPlayerId) ?? standings[0] ?? null;

  const awards = useMemo(
    () => computeTournamentAwards(state, standings),
    [state, standings]
  );

  const awardBadgeByPlayer = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of awards) {
      for (const pid of a.playerIds) {
        if (!map.has(pid)) map.set(pid, a.badge);
      }
    }
    return map;
  }, [awards]);

  const first = standings[0] ?? null;
  const second = standings[1] ?? null;
  const third = standings[2] ?? null;

  // Olympic order: #2 left, #1 center elevated, #3 right (side-by-side even on mobile!)
  const podiumOrder: Array<{
    item: PlayerStanding;
    rank: 1 | 2 | 3;
    ringColor: string;
    shortLabel: string;
    fullLabel: string;
    heightClass: string;
  }> = [];
  if (second) {
    podiumOrder.push({
      item: second,
      rank: 2,
      ringColor: '#CBD5E1',
      shortLabel: '亚军',
      fullLabel: '亚军 · SILVER',
      heightClass: 'pt-3.5 pb-3 sm:pt-5 sm:pb-4 mt-5 sm:mt-6',
    });
  }
  if (first) {
    podiumOrder.push({
      item: first,
      rank: 1,
      ringColor: '#F5C451',
      shortLabel: 'MVP',
      fullLabel: '全场 MVP · 冠军',
      heightClass: 'pt-4 pb-3.5 sm:pt-6 sm:pb-5',
    });
  }
  if (third) {
    podiumOrder.push({
      item: third,
      rank: 3,
      ringColor: '#E59B6B',
      shortLabel: '季军',
      fullLabel: '季军 · BRONZE',
      heightClass: 'pt-3.5 pb-3 sm:pt-5 sm:pb-4 mt-7 sm:mt-8',
    });
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            荣誉殿堂 & 实时积分榜
          </h1>
          <p className="text-xs sm:text-sm text-white/75 mt-1">
            胜场 · 胜率 · 净胜分 · 已完赛{' '}
            <span className="font-mono tabular-nums theme-accent-text font-bold">
              {completedMatches}/{totalMatches}
            </span>{' '}
            场
          </p>
        </div>
        <div className="flex items-center gap-2">
          {first && (
            <button
              type="button"
              onClick={() => onOpenPlayerPoster(first.player.id)}
              className="min-h-[40px] px-3 rounded-xl bg-white/12 border border-white/20 text-white text-xs sm:text-sm font-bold hover:bg-white/20 active:scale-[0.98] transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Crown className="w-4 h-4 text-[#F5C451]" aria-hidden="true" />
              <span>MVP 荣耀卡</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenReport}
            className="min-h-[40px] px-3.5 rounded-xl theme-accent-bg text-xs sm:text-sm font-bold active:scale-[0.98] transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-lg"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>全场画报</span>
          </button>
        </div>
      </div>

      {/* True 3-Tier Side-by-Side Olympic Championship Podium */}
      {podiumOrder.length > 0 && (
        <section
          aria-label="前三名领奖台"
          className="grid grid-cols-3 gap-2 sm:gap-3.5 items-end"
        >
          {podiumOrder.map(({ item, rank, ringColor, shortLabel, fullLabel, heightClass }) => {
            const isGold = rank === 1;
            const avatarSrc = resolvePlayerAvatar(
              item.player.name,
              item.player.avatarUrl,
              avatarsByName
            );
            return (
              <div
                key={item.player.id}
                className={`relative rounded-2xl sm:rounded-3xl px-2 sm:px-4 text-center overflow-hidden border transition-all ${heightClass} ${
                  isGold
                    ? 'theme-glass-strong border-[#F5C451]/75 shadow-2xl'
                    : 'theme-glass border-white/[0.16]'
                }`}
                style={
                  isGold
                    ? {
                        background:
                          'linear-gradient(165deg, rgba(245, 196, 81, 0.24) 0%, rgba(16, 22, 34, 0.86) 52%, rgba(16, 22, 34, 0.92) 100%)',
                      }
                    : undefined
                }
              >
                {/* Top Rank Kicker */}
                <div className="flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-mono font-bold tracking-wider mb-2 sm:mb-3">
                  {isGold && <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#F5C451]" aria-hidden="true" />}
                  <span style={{ color: ringColor }} className="sm:hidden">
                    {shortLabel}
                  </span>
                  <span style={{ color: ringColor }} className="hidden sm:inline">
                    {fullLabel}
                  </span>
                </div>

                {/* Portrait Circular Avatar with Metallic Medal Ring */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlayerId(item.player.id);
                    setMobileSheetOpen(true);
                  }}
                  aria-label={`查看第${rank}名 ${item.player.name} 战绩`}
                  className="relative mx-auto inline-flex flex-col items-center cursor-pointer group"
                >
                  <div
                    className={`rounded-full p-0.5 sm:p-1 transition-transform group-hover:scale-105 ${
                      isGold
                        ? 'w-16 h-16 sm:w-24 sm:h-24'
                        : 'w-13 h-13 sm:w-20 sm:h-20'
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${ringColor}, rgba(255,255,255,0.28))`,
                    }}
                  >
                    <img
                      src={avatarSrc}
                      alt={item.player.name}
                      className="w-full h-full rounded-full object-cover border-2 border-[#0F172A]"
                    />
                  </div>
                  <span
                    className="-mt-2 font-score italic text-[10px] sm:text-xs font-extrabold px-2 py-0.5 rounded-full text-[#0F172A] shadow"
                    style={{ backgroundColor: ringColor }}
                  >
                    NO.0{rank}
                  </span>
                </button>

                {/* Name + Emotional Scoreboard */}
                <h2 className="mt-2 text-sm sm:text-xl font-extrabold text-white truncate">
                  {item.player.name}
                </h2>
                <div className="mt-0.5 flex flex-col sm:flex-row sm:items-baseline justify-center sm:gap-2.5">
                  <span
                    className={`font-score italic font-extrabold leading-none ${
                      isGold ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-3xl'
                    }`}
                    style={{ color: isGold ? '#F5C451' : item.pointDiff >= 0 ? '#34E39C' : '#FF8A75' }}
                  >
                    {item.pointDiff > 0 ? `+${item.pointDiff}` : item.pointDiff}
                  </span>
                  <span className="text-[10px] sm:text-xs font-mono tabular-nums text-white/70 mt-0.5 sm:mt-0">
                    {item.wins}胜{item.losses}负
                    <span className="hidden sm:inline">
                      {' '}
                      · {item.played > 0 ? `${Math.round(item.winRate * 100)}%` : '--'}
                    </span>
                  </span>
                </div>

                {/* One-Tap Personal Highlight Poster CTA */}
                <button
                  type="button"
                  onClick={() => onOpenPlayerPoster(item.player.id)}
                  className={`mt-2.5 sm:mt-4 w-full min-h-[34px] sm:min-h-[40px] px-1.5 rounded-xl text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 transition-all active:scale-[0.98] cursor-pointer whitespace-nowrap ${
                    isGold
                      ? 'bg-[#F5C451] text-[#111317] hover:bg-[#FBD678]'
                      : 'bg-white/12 text-white hover:bg-white/20 border border-white/15'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="sm:hidden">高光卡</span>
                  <span className="hidden sm:inline">生成 TA 的高光海报</span>
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* 6-Card Emotional Honor Awards Wall ("本场高光荣誉榜") */}
      {awards.length > 0 && (
        <section aria-label="本场高光荣誉奖项" className="space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <Award className="w-4 h-4 theme-accent-text" aria-hidden="true" />
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                本场高光荣誉墙
              </h2>
            </div>
            <span className="text-xs text-white/65">点击任意奖项生成专属荣耀海报</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {awards.map((award) => {
              const primaryPlayerId = award.playerIds[0];
              return (
                <button
                  key={award.id}
                  type="button"
                  onClick={() => primaryPlayerId && onOpenPlayerPoster(primaryPlayerId)}
                  aria-label={`生成 ${award.playerNames.join('与')} 的 ${award.badge} 高光海报`}
                  className="theme-glass rounded-2xl border border-white/[0.14] hover:border-white/35 p-4 text-left transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AwardIcon id={award.id} color={award.accentColor} />
                      <span
                        className="text-xs font-extrabold tracking-wide truncate"
                        style={{ color: award.accentColor }}
                      >
                        {award.badge} · {award.title}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className="font-score italic text-2xl font-extrabold leading-none"
                        style={{ color: award.accentColor }}
                      >
                        {award.metricValue}
                      </span>
                      <div className="text-[10px] text-white/55">{award.metricLabel}</div>
                    </div>
                  </div>

                  {/* Winner Avatar(s) + Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center -space-x-2.5 shrink-0">
                      {award.playerIds.map((pid, idx) => {
                        const p = playerMap.get(pid);
                        const name = p?.name ?? award.playerNames[idx] ?? '球友';
                        const src = resolvePlayerAvatar(name, p?.avatarUrl, avatarsByName);
                        return (
                          <img
                            key={pid}
                            src={src}
                            alt={name}
                            className="w-11 h-11 rounded-full object-cover border-2 border-[#0F172A]"
                            style={{ boxShadow: `0 0 0 2px ${award.accentColor}` }}
                          />
                        );
                      })}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm sm:text-base font-extrabold text-white truncate">
                        {award.playerNames.join(' × ')}
                      </div>
                      <div className="text-[11px] text-white/70 truncate mt-0.5">
                        {award.subtitle}
                      </div>
                    </div>
                  </div>

                  <p className="text-[11.5px] text-white/75 leading-relaxed line-clamp-2 border-t border-white/[0.08] pt-2.5">
                    “{award.slogan}”
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* DeepSeek AI Tournament Intelligence Panel */}
      <AiAnalysisPanel state={state} standings={standings} fairness={fairness} />

      {/* Main Split: Left Standings Table (with Avatars + Honor Tags) + Right Desktop Player Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-8 theme-glass-strong rounded-3xl border border-white/[0.14] overflow-hidden">
          <div className="grid grid-cols-[28px_minmax(112px,1fr)_48px_50px_54px] sm:grid-cols-[48px_1fr_82px_78px_92px] items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 bg-black/25 border-b border-white/[0.08] text-xs font-semibold text-white/65">
            <span className="text-center">#</span>
            <span>球手 & 称号</span>
            <span className="text-right">胜负</span>
            <span className="text-right">净胜</span>
            <span className="text-right">高光卡</span>
          </div>

          <div className="divide-y divide-white/[0.08]">
            {standings.map((row) => {
              const isSelected = selectedStanding?.player.id === row.player.id;
              const avatarSrc = resolvePlayerAvatar(
                row.player.name,
                row.player.avatarUrl,
                avatarsByName
              );
              const honorTag = awardBadgeByPlayer.get(row.player.id);
              return (
                <div
                  key={row.player.id}
                  className={`grid grid-cols-[28px_minmax(112px,1fr)_48px_50px_54px] sm:grid-cols-[48px_1fr_82px_78px_92px] items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 transition-colors ${
                    isSelected ? 'bg-white/[0.1]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className={`font-score italic text-xl font-extrabold text-center ${
                      row.rank === 1
                        ? 'text-[#F5C451]'
                        : row.rank <= 3
                        ? 'theme-accent-text'
                        : 'text-white/50'
                    }`}
                  >
                    {String(row.rank).padStart(2, '0')}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlayerId(row.player.id);
                      setMobileSheetOpen(true);
                    }}
                    aria-label={`查看 ${row.player.name} 详细战绩，第${row.rank}名`}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                  >
                    <img
                      src={avatarSrc}
                      alt={row.player.name}
                      className={`w-9 h-9 rounded-full object-cover shrink-0 ring-2 ${
                        row.rank === 1
                          ? 'ring-[#F5C451]'
                          : row.rank <= 3
                          ? 'ring-[var(--theme-accent)]/70'
                          : 'ring-white/20'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                        <span className="truncate">{row.player.name}</span>
                        {!row.player.active && (
                          <span className="text-[11px] font-normal text-white/55">(暂离)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-white/65 truncate">
                        {honorTag ? (
                          <span className="theme-accent-text font-semibold">{honorTag}</span>
                        ) : (
                          <span className="font-mono tabular-nums">
                            DUPR {row.player.rating.toFixed(1)}
                          </span>
                        )}
                        <span className="hidden sm:inline font-mono tabular-nums">
                          {' '}
                          · 胜率 {row.played > 0 ? `${Math.round(row.winRate * 100)}%` : '--'}
                        </span>
                      </div>
                    </div>
                  </button>

                  <span className="font-mono tabular-nums text-xs sm:text-sm font-semibold text-white text-right whitespace-nowrap">
                    {row.wins}-{row.losses}
                  </span>

                  <span
                    className={`font-score italic text-2xl font-extrabold text-right whitespace-nowrap ${
                      row.pointDiff > 0
                        ? 'text-[#34E39C]'
                        : row.pointDiff < 0
                        ? 'text-[#FF8A75]'
                        : 'text-white/55'
                    }`}
                  >
                    {row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}
                  </span>

                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenPlayerPoster(row.player.id)}
                      aria-label={`生成 ${row.player.name} 的个人高光海报`}
                      className="min-h-[34px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold theme-accent-text whitespace-nowrap cursor-pointer active:scale-95 transition-all"
                    >
                      海报
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlayerId(row.player.id);
                        setMobileSheetOpen(true);
                      }}
                      aria-label={`展开 ${row.player.name} 详情`}
                      className="hidden sm:inline-flex p-1 text-white/50 hover:text-white cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Desktop Side Panel for Selected Player */}
        <aside className="hidden lg:block lg:col-span-4 theme-glass-strong rounded-3xl border border-white/[0.14] p-5 sticky top-24 space-y-4">
          {selectedStanding ? (
            <>
              <PlayerDetailContent
                standing={selectedStanding}
                state={state}
                playerMap={playerMap}
              />
              <button
                type="button"
                onClick={() => onOpenPlayerPoster(selectedStanding.player.id)}
                className="w-full min-h-[44px] rounded-xl theme-accent-bg text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>生成 {selectedStanding.player.name} 的专属高光海报</span>
              </button>
            </>
          ) : (
            <p className="text-sm text-white/65">选择左侧任意球员查看详细战绩</p>
          )}
        </aside>
      </div>

      {/* Mobile Player Detail Bottom Sheet */}
      {mobileSheetOpen && (
        <PlayerDetailSheet
          standing={selectedStanding}
          state={state}
          playerMap={playerMap}
          onClose={() => setMobileSheetOpen(false)}
        />
      )}
    </div>
  );
}
