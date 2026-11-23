import { useEffect, useState } from 'react';
import { ArrowLeftRight, Minus, Plus, RotateCcw, Trophy, X } from 'lucide-react';
import type { Match, Player, ScoringTarget } from '../types/tournament';
import { resolvePlayerAvatar } from '../utils/avatarUtils';
import { validateMatchScore } from '../utils/scheduler';

interface ScoreSheetProps {
  match: Match | null;
  playerMap: Map<string, Player>;
  avatarsByName?: Record<string, string>;
  targetScore: ScoringTarget;
  winByTwo: boolean;
  onClose: () => void;
  onSaveScore: (matchId: string, scoreA: number, scoreB: number) => void;
  onClearScore: (matchId: string) => void;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(35, Math.floor(value)));
}

export function ScoreSheet({
  match,
  playerMap,
  avatarsByName,
  targetScore,
  winByTwo,
  onClose,
  onSaveScore,
  onClearScore,
}: ScoreSheetProps) {
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [rawA, setRawA] = useState<string>('0');
  const [rawB, setRawB] = useState<string>('0');

  useEffect(() => {
    if (!match) return;
    const initA = match.scoreA ?? 0;
    const initB = match.scoreB ?? 0;
    setScoreA(initA);
    setScoreB(initB);
    setRawA(String(initA));
    setRawB(String(initB));
  }, [match]);

  useEffect(() => {
    if (!match) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [match, onClose]);

  if (!match) return null;

  const teamAPlayers = match.teamA.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
  const teamBPlayers = match.teamB.map((id) => playerMap.get(id)).filter(Boolean) as Player[];
  const teamANames = match.teamA.map((id) => playerMap.get(id)?.name ?? '球友').join(' / ');
  const teamBNames = match.teamB.map((id) => playerMap.get(id)?.name ?? '球友').join(' / ');
  const validation = validateMatchScore(scoreA, scoreB, targetScore, winByTwo);

  const presets: Array<[number, number]> = [
    [targetScore, Math.max(0, targetScore - 2)],
    [targetScore, Math.max(0, targetScore - 4)],
    [Math.max(0, targetScore - 2), targetScore],
    [Math.max(0, targetScore - 4), targetScore],
  ];

  const updateScoreA = (next: number) => {
    const clamped = clampScore(next);
    setScoreA(clamped);
    setRawA(String(clamped));
  };

  const updateScoreB = (next: number) => {
    const clamped = clampScore(next);
    setScoreB(clamped);
    setRawB(String(clamped));
  };

  const handleInputA = (text: string) => {
    const digits = text.replace(/[^\d]/g, '').slice(0, 2);
    setRawA(digits);
    setScoreA(digits === '' ? 0 : clampScore(Number(digits)));
  };

  const handleInputB = (text: string) => {
    const digits = text.replace(/[^\d]/g, '').slice(0, 2);
    setRawB(digits);
    setScoreB(digits === '' ? 0 : clampScore(Number(digits)));
  };

  const handleConfirm = () => {
    if (!validation.valid) return;
    onSaveScore(match.id, scoreA, scoreB);
    onClose();
  };

  const renderTeamAvatars = (players: Player[], isWinner: boolean) => (
    <div className="flex items-center justify-center -space-x-2 mb-1.5">
      {players.map((p) => {
        const src = resolvePlayerAvatar(p.name, p.avatarUrl, avatarsByName);
        return (
          <img
            key={p.id}
            src={src}
            alt={p.name}
            className={`w-9 h-9 rounded-full object-cover border-2 transition-all ${
              isWinner
                ? 'border-[var(--theme-accent)] shadow-md'
                : 'border-[#111827]'
            }`}
          />
        );
      })}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg theme-glass-strong text-[#F8FAFC] rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl border max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Crisp Header */}
        <div className="px-5 pt-3 pb-4 border-b border-white/[0.1] bg-black/25">
          <div className="md:hidden w-10 h-1.5 bg-white/25 rounded-full mx-auto mb-3" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="score-sheet-title" className="text-lg font-extrabold text-white">
                第 {match.roundNumber} 轮 · {String(match.courtNumber).padStart(2, '0')}号场记分
              </h2>
              <p className="text-xs text-white/70 mt-0.5 font-mono tabular-nums">
                {targetScore}分制 · {winByTwo ? '净胜2分校验' : '先到即胜'} · 点击数字可直接键盘输入
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭记分面板"
              className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 pb-safe overflow-y-auto space-y-5">
          {/* Dual Scoreboard with Direct Numeric Input + Steppers */}
          <div className="relative grid grid-cols-2 gap-3.5">
            {/* Team A */}
            <div
              className={`rounded-2xl p-4 flex flex-col items-center text-center border transition-all ${
                validation.winner === 'A'
                  ? 'bg-white/[0.12] border-[var(--theme-accent)] shadow-lg'
                  : 'bg-black/30 border-white/[0.12]'
              }`}
            >
              {renderTeamAvatars(teamAPlayers, validation.winner === 'A')}
              <div className="flex items-center gap-1 text-[11px] font-semibold text-white/70">
                <span>左半场 · A队</span>
                {validation.winner === 'A' && (
                  <Trophy className="w-3 h-3 theme-accent-text" aria-hidden="true" />
                )}
              </div>
              <p className="text-sm font-bold text-white mt-0.5 line-clamp-1">{teamANames}</p>

              {/* Direct Manual Numeric Score Input */}
              <div className="my-3 w-full flex flex-col items-center">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={rawA}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => setRawA(String(scoreA))}
                  onChange={(e) => handleInputA(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && validation.valid) handleConfirm();
                  }}
                  aria-label={`A队 (${teamANames}) 比分输入`}
                  data-testid="score-a-input"
                  className={`w-28 h-20 text-center font-score italic text-6xl font-extrabold leading-none rounded-2xl bg-black/35 border border-white/[0.16] focus:border-[var(--theme-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 transition-all tabular-nums ${
                    validation.winner === 'A' ? 'theme-accent-text' : 'text-white'
                  }`}
                />
                <span className="sr-only" data-testid="score-a-value">
                  {scoreA}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => updateScoreA(scoreA - 1)}
                  aria-label="A队减1分"
                  className="flex-1 min-h-[46px] rounded-xl bg-black/40 border border-white/[0.14] text-white flex items-center justify-center hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => updateScoreA(scoreA + 1)}
                  aria-label="A队加1分"
                  className="flex-1 min-h-[46px] rounded-xl theme-accent-bg flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Swap Scores Mid Button */}
            <button
              type="button"
              onClick={() => {
                const tmpA = scoreA;
                const tmpB = scoreB;
                updateScoreA(tmpB);
                updateScoreB(tmpA);
              }}
              aria-label="互换双方比分"
              title="互换双方比分"
              className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-[#0F172A] border border-white/25 shadow-xl theme-accent-text hover:scale-105 flex items-center justify-center cursor-pointer active:scale-90 transition-all"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            {/* Team B */}
            <div
              className={`rounded-2xl p-4 flex flex-col items-center text-center border transition-all ${
                validation.winner === 'B'
                  ? 'bg-white/[0.12] border-[var(--theme-accent)] shadow-lg'
                  : 'bg-black/30 border-white/[0.12]'
              }`}
            >
              {renderTeamAvatars(teamBPlayers, validation.winner === 'B')}
              <div className="flex items-center gap-1 text-[11px] font-semibold text-white/70">
                <span>B队 · 右半场</span>
                {validation.winner === 'B' && (
                  <Trophy className="w-3 h-3 theme-accent-text" aria-hidden="true" />
                )}
              </div>
              <p className="text-sm font-bold text-white mt-0.5 line-clamp-1">{teamBNames}</p>

              {/* Direct Manual Numeric Score Input */}
              <div className="my-3 w-full flex flex-col items-center">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={rawB}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => setRawB(String(scoreB))}
                  onChange={(e) => handleInputB(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && validation.valid) handleConfirm();
                  }}
                  aria-label={`B队 (${teamBNames}) 比分输入`}
                  data-testid="score-b-input"
                  className={`w-28 h-20 text-center font-score italic text-6xl font-extrabold leading-none rounded-2xl bg-black/35 border border-white/[0.16] focus:border-[var(--theme-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 transition-all tabular-nums ${
                    validation.winner === 'B' ? 'theme-accent-text' : 'text-white'
                  }`}
                />
                <span className="sr-only" data-testid="score-b-value">
                  {scoreB}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => updateScoreB(scoreB - 1)}
                  aria-label="B队减1分"
                  className="flex-1 min-h-[46px] rounded-xl bg-black/40 border border-white/[0.14] text-white flex items-center justify-center hover:bg-white/[0.12] active:scale-95 transition-all cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => updateScoreB(scoreB + 1)}
                  aria-label="B队加1分"
                  className="flex-1 min-h-[46px] rounded-xl theme-accent-bg flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Fast Court Presets */}
          <div>
            <p className="text-xs font-medium text-white/65 mb-2">快捷比分（一键填入）</p>
            <div className="grid grid-cols-4 gap-2">
              {presets.map(([a, b]) => {
                const isSelected = scoreA === a && scoreB === b;
                return (
                  <button
                    key={`${a}-${b}`}
                    type="button"
                    onClick={() => {
                      updateScoreA(a);
                      updateScoreB(b);
                    }}
                    className={`min-h-[44px] rounded-xl border text-sm font-mono tabular-nums font-semibold active:scale-95 transition-all cursor-pointer ${
                      isSelected
                        ? 'theme-accent-bg border-transparent'
                        : 'bg-black/30 text-white border-white/[0.12] hover:border-white/30'
                    }`}
                  >
                    {a}:{b}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Validation Feedback */}
          {validation.error && (
            <p
              role="alert"
              className="text-xs text-[#FFB4A2] bg-[#3B1515]/80 border border-[#FF6448]/40 rounded-xl px-3.5 py-2.5"
            >
              {validation.error}
            </p>
          )}
          {validation.warning && (
            <p className="text-xs text-[#FDE68A] bg-[#38290C]/80 border border-[#F59E0B]/40 rounded-xl px-3.5 py-2.5">
              {validation.warning}
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex items-center gap-3">
            {match.status === 'completed' && (
              <button
                type="button"
                onClick={() => {
                  onClearScore(match.id);
                  onClose();
                }}
                aria-label="清除此场比分"
                className="min-h-[48px] px-4 rounded-xl border border-white/[0.14] bg-black/30 text-sm font-medium text-white/80 hover:text-[#FF8A75] hover:border-[#FF6448]/45 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>清除</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!validation.valid}
              className={`flex-1 min-h-[48px] rounded-xl text-sm font-bold active:scale-[0.98] transition-all duration-100 ${
                validation.valid
                  ? 'theme-accent-bg cursor-pointer shadow-lg'
                  : 'bg-white/[0.08] text-white/40 cursor-not-allowed'
              }`}
            >
              确认比分并实时同步上云
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
