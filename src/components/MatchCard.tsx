import { ArrowLeftRight, CheckCircle2, Crown, Edit3, Sparkles } from 'lucide-react';
import type { Match, Player } from '../types/tournament';
import { resolvePlayerAvatar } from '../utils/avatarUtils';
import { calculateMatchBalance } from '../utils/scheduler';

interface MatchCardProps {
  match: Match;
  playerMap: Map<string, Player>;
  avatarsByName?: Record<string, string>;
  swapMode: boolean;
  selectedSwapPlayerId: string | null;
  focusedPlayerId: string | null;
  onOpenScore: (match: Match) => void;
  onOpenAiPreview: (match: Match) => void;
  onSelectSwapPlayer: (playerId: string) => void;
}

function genderText(gender: Player['gender']): string {
  if (gender === 'M') return '男';
  if (gender === 'F') return '女';
  return '';
}

export function MatchCard({
  match,
  playerMap,
  avatarsByName,
  swapMode,
  selectedSwapPlayerId,
  focusedPlayerId,
  onOpenScore,
  onOpenAiPreview,
  onSelectSwapPlayer,
}: MatchCardProps) {
  const isCompleted =
    match.status === 'completed' && match.scoreA !== null && match.scoreB !== null;
  const winnerA = isCompleted && (match.scoreA ?? 0) > (match.scoreB ?? 0);
  const winnerB = isCompleted && (match.scoreB ?? 0) > (match.scoreA ?? 0);
  const balance = calculateMatchBalance(match, playerMap);

  const focusedInA = focusedPlayerId ? match.teamA.includes(focusedPlayerId) : false;
  const focusedInB = focusedPlayerId ? match.teamB.includes(focusedPlayerId) : false;
  const isMatchFocused = focusedInA || focusedInB;
  const dimmedByFocus = Boolean(focusedPlayerId) && !isMatchFocused;

  const getRelationTag = (playerId: string, side: 'A' | 'B'): string | null => {
    if (!focusedPlayerId || !isMatchFocused) return null;
    if (playerId === focusedPlayerId) return '我';
    const sameSide = (side === 'A' && focusedInA) || (side === 'B' && focusedInB);
    return sameSide ? '搭档' : '对手';
  };

  const renderCourtPlayerSlot = (playerId: string, side: 'A' | 'B') => {
    const player = playerMap.get(playerId);
    const name = player?.name ?? '未知球友';
    const rating = player ? player.rating.toFixed(1) : '3.5';
    const g = player ? genderText(player.gender) : '';
    const relation = getRelationTag(playerId, side);
    const isMe = relation === '我';
    const isPartner = relation === '搭档';
    const isSelectedForSwap = swapMode && selectedSwapPlayerId === playerId;
    const isRight = side === 'B';
    const avatarSrc = resolvePlayerAvatar(name, player?.avatarUrl, avatarsByName);

    const content = (
      <div
        className={`flex items-center gap-2 min-w-0 ${
          isRight ? 'flex-row-reverse text-right' : 'flex-row text-left'
        }`}
      >
        <div
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shrink-0 ring-2 ${
            isMe || isSelectedForSwap
              ? 'ring-[var(--theme-accent)]'
              : isPartner
              ? 'ring-[#7CC2FF]'
              : 'ring-white/25'
          }`}
        >
          <img src={avatarSrc} alt={name} className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className={`font-bold text-[13px] sm:text-sm truncate ${
              isSelectedForSwap
                ? 'text-[var(--theme-accent-ink)]'
                : isMe
                ? 'theme-accent-text'
                : 'text-white'
            }`}
          >
            {name}
          </div>
          <div
            className={`flex items-center gap-0.5 sm:gap-1 text-[10.5px] sm:text-[11px] font-mono tabular-nums leading-tight mt-0.5 truncate ${
              isRight ? 'justify-end' : 'justify-start'
            }`}
          >
            {relation && (
              <span
                className={`font-sans font-bold shrink-0 ${
                  isSelectedForSwap
                    ? 'text-[var(--theme-accent-ink)]'
                    : isMe
                    ? 'theme-accent-text'
                    : isPartner
                    ? 'text-[#7CC2FF]'
                    : 'text-white/65'
                }`}
              >
                {relation}·
              </span>
            )}
            <span
              className={`whitespace-nowrap ${
                isSelectedForSwap ? 'text-[var(--theme-accent-ink)]/80' : 'text-white/70'
              }`}
            >
              {g}
              {rating}
            </span>
          </div>
        </div>
      </div>
    );

    if (swapMode && !isCompleted) {
      return (
        <button
          key={playerId}
          type="button"
          onClick={() => onSelectSwapPlayer(playerId)}
          aria-label={`选择 ${name} 交换位置`}
          aria-pressed={isSelectedForSwap}
          className={`w-full min-h-[48px] px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl border transition-all cursor-pointer ${
            isSelectedForSwap
              ? 'theme-accent-bg border-transparent scale-[1.02]'
              : 'bg-[#080C14]/88 backdrop-blur-md border-white/15 hover:border-[var(--theme-accent)]/70'
          }`}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        key={playerId}
        className={`w-full px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl border backdrop-blur-md transition-all ${
          isMe
            ? 'bg-[#0B111C]/95 border-[var(--theme-accent)] shadow-sm'
            : isPartner
            ? 'bg-[#090E18]/90 border-[#7CC2FF]/60'
            : 'bg-[#080C14]/84 border-white/[0.14]'
        }`}
      >
        {content}
      </div>
    );
  };

  return (
    <article
      className={`theme-glass rounded-3xl border overflow-hidden transition-all duration-200 ${
        isMatchFocused
          ? 'border-[var(--theme-accent)] shadow-xl'
          : 'border-white/[0.15]'
      } ${dimmedByFocus ? 'opacity-45' : 'opacity-100'}`}
      aria-label={`第${match.roundNumber}轮 ${match.courtNumber}号场`}
    >
      {/* Top Court Header Strip */}
      <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0 text-xs text-white/70">
          <span className="font-score italic text-xl font-extrabold tracking-wide text-white leading-none">
            {String(match.courtNumber).padStart(2, '0')}号场
          </span>
          <span aria-hidden="true" className="text-white/25">
            ·
          </span>
          <span className="font-mono tabular-nums whitespace-nowrap text-white/85">
            均势 {balance.balancePct}%
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-white/25">
            ·
          </span>
          <span className="hidden sm:inline font-mono tabular-nums whitespace-nowrap">
            {balance.avgA.toFixed(1)} vs {balance.avgB.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 text-[#34E39C]">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>已完赛</span>
            </span>
          ) : swapMode ? (
            <span className="inline-flex items-center gap-1 theme-accent-text">
              <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
              <span>点选换位</span>
            </span>
          ) : (
            <span className="text-white/70">进行中 / 待记分</span>
          )}
        </div>
      </div>

      {/* Illuminated Scenic Hard-Court Arena */}
      <div className="p-2.5 sm:p-3 bg-black/20">
        <div
          className="relative rounded-2xl overflow-hidden p-2.5 sm:p-3 border border-white/[0.16]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, var(--theme-court-glow) 0%, var(--theme-court-outer) 100%)',
          }}
        >
          {/* Authentic Pro Hard-Court Geometry SVG */}
          <svg
            aria-hidden="true"
            viewBox="0 0 400 180"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 w-full h-full"
          >
            <rect x="0" y="0" width="400" height="180" fill="var(--theme-court-outer)" fillOpacity="0.45" />
            <rect x="12" y="10" width="376" height="160" rx="3" fill="var(--theme-court-inner)" fillOpacity="0.82" />
            <rect x="142" y="10" width="116" height="160" fill="var(--theme-court-kitchen)" fillOpacity="0.72" />
            <rect
              x="12"
              y="10"
              width="376"
              height="160"
              rx="3"
              fill="none"
              stroke="rgba(255,255,255,0.68)"
              strokeWidth="1.6"
            />
            <line x1="142" y1="10" x2="142" y2="170" stroke="rgba(255,255,255,0.58)" strokeWidth="1.5" />
            <line x1="258" y1="10" x2="258" y2="170" stroke="rgba(255,255,255,0.58)" strokeWidth="1.5" />
            <line x1="12" y1="90" x2="142" y2="90" stroke="rgba(255,255,255,0.36)" strokeWidth="1.2" />
            <line x1="258" y1="90" x2="388" y2="90" stroke="rgba(255,255,255,0.36)" strokeWidth="1.2" />
            <line
              x1="200"
              y1="5"
              x2="200"
              y2="175"
              stroke="#FFFFFF"
              strokeOpacity="0.92"
              strokeWidth="2.2"
              strokeDasharray="4 3"
            />
          </svg>

          <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2.5">
            {/* Team A (Left Half-Court) */}
            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <div className="flex items-center justify-between px-1 text-[11px] font-semibold">
                <span className="text-white/90">A队</span>
                {winnerA && (
                  <span className="inline-flex items-center gap-0.5 text-[#FCD34D] font-extrabold">
                    <Crown className="w-3 h-3" aria-hidden="true" />
                    WIN
                  </span>
                )}
              </div>
              {match.teamA.map((pid) => renderCourtPlayerSlot(pid, 'A'))}
            </div>

            {/* Center Net Broadcast Scoreboard */}
            <div className="flex flex-col items-center justify-center">
              {isCompleted ? (
                <button
                  type="button"
                  onClick={() => !swapMode && onOpenScore(match)}
                  disabled={swapMode}
                  aria-label={`修改 第${match.roundNumber}轮 ${match.courtNumber}号场 比分 ${match.scoreA}比${match.scoreB}`}
                  className="min-h-[50px] min-w-[64px] sm:min-w-[78px] px-2 sm:px-2.5 py-1.5 rounded-2xl bg-[#070A10]/95 border border-white/25 shadow-lg flex items-center justify-center gap-1 cursor-pointer hover:border-[var(--theme-accent)] active:scale-95 transition-all"
                >
                  <span
                    className={`font-score italic text-2xl sm:text-3xl font-extrabold leading-none ${
                      winnerA ? 'theme-accent-text' : 'text-white/60'
                    }`}
                  >
                    {match.scoreA}
                  </span>
                  <span className="text-white/35 font-score text-lg leading-none">:</span>
                  <span
                    className={`font-score italic text-2xl sm:text-3xl font-extrabold leading-none ${
                      winnerB ? 'theme-accent-text' : 'text-white/60'
                    }`}
                  >
                    {match.scoreB}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => !swapMode && onOpenScore(match)}
                  disabled={swapMode}
                  aria-label={`快捷录入 第${match.roundNumber}轮 ${match.courtNumber}号场 比分`}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#070A10]/95 border border-white/25 shadow-lg flex items-center justify-center cursor-pointer hover:border-[var(--theme-accent)] active:scale-95 transition-all"
                >
                  <span className="font-score italic text-xs sm:text-base font-extrabold tracking-wider theme-accent-text">
                    VS
                  </span>
                </button>
              )}
            </div>

            {/* Team B (Right Half-Court) */}
            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <div className="flex items-center justify-between px-1 text-[11px] font-semibold">
                {winnerB ? (
                  <span className="inline-flex items-center gap-0.5 text-[#FCD34D] font-extrabold">
                    <Crown className="w-3 h-3" aria-hidden="true" />
                    WIN
                  </span>
                ) : (
                  <span />
                )}
                <span className="text-white/90">B队</span>
              </div>
              {match.teamB.map((pid) => renderCourtPlayerSlot(pid, 'B'))}
            </div>
          </div>
        </div>
      </div>

      {/* Optional DeepSeek Matchmaking Storyline */}
      {match.aiReason && (
        <div className="px-4 sm:px-5 py-2 bg-black/25 border-t border-white/[0.08] flex items-center gap-2 text-xs text-white/85">
          <Sparkles className="w-3.5 h-3.5 theme-accent-text shrink-0" aria-hidden="true" />
          <span className="truncate">{match.aiReason}</span>
        </div>
      )}

      {/* Bottom Action Strip */}
      {!swapMode && (
        <div className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2 bg-black/15">
          <button
            type="button"
            onClick={() => onOpenAiPreview(match)}
            aria-label={`查看 第${match.roundNumber}轮 ${match.courtNumber}号场 AI 战术预测`}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.1] text-white/90 hover:bg-white/[0.18] hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 theme-accent-text" aria-hidden="true" />
            <span>AI 战术</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenScore(match)}
            aria-label={`${isCompleted ? '修改' : '录入'} 第${match.roundNumber}轮 ${match.courtNumber}号场 比分`}
            className={`min-h-[40px] px-4 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.98] ${
              isCompleted
                ? 'bg-white/[0.12] text-white hover:bg-white/[0.2]'
                : 'theme-accent-bg shadow-md'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isCompleted ? '修改比分' : '录入比分'}</span>
          </button>
        </div>
      )}
    </article>
  );
}
