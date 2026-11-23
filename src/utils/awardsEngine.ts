import type { Player, PlayerStanding, Round, TournamentState } from '../types/tournament';

export type HonorAwardId =
  | 'mvp'
  | 'best_duo'
  | 'clutch_king'
  | 'scoring_machine'
  | 'iron_wall'
  | 'rising_star';

export interface HonorAward {
  id: HonorAwardId;
  badge: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  playerIds: string[];
  playerNames: string[];
  accentColor: string;
  slogan: string;
}

export interface PlayerHonorProfile {
  primaryBadge: string;
  primaryTitle: string;
  slogan: string;
  awards: HonorAward[];
}

/**
 * Computes rich, factual, emotionally celebratory post-match awards from completed matches
 * so not only #1 MVP, but every standout player gets a share-worthy honor title.
 */
export function computeTournamentAwards(
  state: TournamentState,
  standings: PlayerStanding[]
): HonorAward[] {
  const activeStandings = standings.filter((s) => s.played > 0);
  if (activeStandings.length === 0) return [];

  const playerMap = new Map<string, Player>();
  state.players.forEach((p) => playerMap.set(p.id, p));

  const completedMatches = state.rounds.flatMap((r: Round) =>
    r.matches.filter((m) => m.status === 'completed' && m.scoreA !== null && m.scoreB !== null)
  );

  const awards: HonorAward[] = [];

  // 1. 全场 MVP / 制霸球王
  const mvp = activeStandings[0];
  if (mvp) {
    awards.push({
      id: 'mvp',
      badge: '全场 MVP',
      title: '制霸球王',
      subtitle: `${mvp.wins}胜${mvp.losses}负 · 胜率 ${Math.round(mvp.winRate * 100)}%`,
      metricLabel: '净胜分',
      metricValue: mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : `${mvp.pointDiff}`,
      playerIds: [mvp.player.id],
      playerNames: [mvp.player.name],
      accentColor: '#F5C451',
      slogan: `今夜球场绝对主角，以 ${mvp.wins} 胜与 ${
        mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : mvp.pointDiff
      } 净胜分加冕榜首！`,
    });
  }

  // 2. 灵魂拍档 / 黄金组合 (best pair synergy across completed matches)
  const duoStats = new Map<
    string,
    { ids: [string, string]; names: [string, string]; games: number; wins: number; diff: number }
  >();

  for (const m of completedMatches) {
    const sA = m.scoreA ?? 0;
    const sB = m.scoreB ?? 0;
    const teams: Array<{ ids: [string, string]; won: boolean; diff: number }> = [
      { ids: m.teamA, won: sA > sB, diff: sA - sB },
      { ids: m.teamB, won: sB > sA, diff: sB - sA },
    ];
    for (const t of teams) {
      const sorted = [...t.ids].sort() as [string, string];
      const key = `${sorted[0]}__${sorted[1]}`;
      const existing = duoStats.get(key) ?? {
        ids: sorted,
        names: [
          playerMap.get(sorted[0])?.name ?? '球友',
          playerMap.get(sorted[1])?.name ?? '球友',
        ],
        games: 0,
        wins: 0,
        diff: 0,
      };
      existing.games += 1;
      if (t.won) existing.wins += 1;
      existing.diff += t.diff;
      duoStats.set(key, existing);
    }
  }

  const bestDuo = Array.from(duoStats.values())
    .filter((d) => d.wins > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.games - a.games;
    })[0];

  if (bestDuo) {
    awards.push({
      id: 'best_duo',
      badge: '灵魂拍档',
      title: '黄金化学反应',
      subtitle: `${bestDuo.wins}胜/${bestDuo.games}场 · 联手净胜 ${
        bestDuo.diff >= 0 ? `+${bestDuo.diff}` : bestDuo.diff
      }`,
      metricLabel: '搭档胜率',
      metricValue: `${Math.round((bestDuo.wins / bestDuo.games) * 100)}%`,
      playerIds: [...bestDuo.ids],
      playerNames: [...bestDuo.names],
      accentColor: '#FF8E62',
      slogan: `${bestDuo.names[0]} × ${bestDuo.names[1]} 默契拉满，网前衔接无懈可击！`,
    });
  }

  // 3. 关键分大心脏 (won close matches with margin <= 2, or highest close-game resilience)
  const clutchWins = new Map<string, number>();
  for (const m of completedMatches) {
    const sA = m.scoreA ?? 0;
    const sB = m.scoreB ?? 0;
    const margin = Math.abs(sA - sB);
    if (margin > 0 && margin <= 2) {
      const winners = sA > sB ? m.teamA : m.teamB;
      winners.forEach((id) => clutchWins.set(id, (clutchWins.get(id) ?? 0) + 1));
    }
  }

  const clutchCandidate = activeStandings
    .map((s) => ({ s, c: clutchWins.get(s.player.id) ?? 0 }))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c || b.s.pointDiff - a.s.pointDiff)[0];

  if (clutchCandidate) {
    awards.push({
      id: 'clutch_king',
      badge: '关键分大心脏',
      title: '绝杀时刻主宰',
      subtitle: `拿下 ${clutchCandidate.c} 场 2 分以内胶着险胜`,
      metricLabel: '关键胜局',
      metricValue: `${clutchCandidate.c}场`,
      playerIds: [clutchCandidate.s.player.id],
      playerNames: [clutchCandidate.s.player.name],
      accentColor: '#FF6B8B',
      slogan: `越到赛点越冷静，关键球一锤定音的真正大心脏！`,
    });
  }

  // 4. 进攻火力王 (highest avg points scored per game, prefer distinct from MVP if close)
  const scoringSorted = [...activeStandings].sort(
    (a, b) => b.avgPointsFor - a.avgPointsFor || b.pointsFor - a.pointsFor
  );
  const scoringKing =
    scoringSorted.find((s) => s.player.id !== mvp?.player.id) ?? scoringSorted[0];
  if (scoringKing) {
    awards.push({
      id: 'scoring_machine',
      badge: '进攻火力王',
      title: '球场得分机器',
      subtitle: `累计狂轰 ${scoringKing.pointsFor} 分`,
      metricLabel: '场均得分',
      metricValue: scoringKing.avgPointsFor.toFixed(1),
      playerIds: [scoringKing.player.id],
      playerNames: [scoringKing.player.name],
      accentColor: '#34E39C',
      slogan: `场均轰下 ${scoringKing.avgPointsFor.toFixed(1)} 分，每一记抽球都在撕裂防线！`,
    });
  }

  // 5. 铁血防守王 (lowest avg points conceded per game)
  const defenseSorted = [...activeStandings].sort((a, b) => {
    const avgA = a.pointsAgainst / Math.max(1, a.played);
    const avgB = b.pointsAgainst / Math.max(1, b.played);
    return avgA - avgB || b.pointDiff - a.pointDiff;
  });
  const ironWall =
    defenseSorted.find(
      (s) => s.player.id !== mvp?.player.id && s.player.id !== scoringKing?.player.id
    ) ?? defenseSorted[0];
  if (ironWall) {
    const avgAgainst = ironWall.pointsAgainst / Math.max(1, ironWall.played);
    awards.push({
      id: 'iron_wall',
      badge: '铁血防守王',
      title: '网前铜墙铁壁',
      subtitle: `防守滴水不漏 · 净胜 ${ironWall.pointDiff >= 0 ? `+${ironWall.pointDiff}` : ironWall.pointDiff}`,
      metricLabel: '场均失分',
      metricValue: avgAgainst.toFixed(1),
      playerIds: [ironWall.player.id],
      playerNames: [ironWall.player.name],
      accentColor: '#7CC2FF',
      slogan: `场均仅失 ${avgAgainst.toFixed(1)} 分，稳健丁克与防反令对手绝望！`,
    });
  }

  // 6. 人气黑马 / 逆袭之星 (highest standing relative to initial DUPR rank)
  const byDuprRank = [...activeStandings].sort((a, b) => b.player.rating - a.player.rating);
  const duprRankMap = new Map<string, number>();
  byDuprRank.forEach((s, idx) => duprRankMap.set(s.player.id, idx + 1));

  const risingCandidate = activeStandings
    .map((s) => ({
      s,
      climb: (duprRankMap.get(s.player.id) ?? s.rank) - s.rank,
    }))
    .filter((x) => x.climb > 0 && x.s.wins > 0)
    .sort((a, b) => b.climb - a.climb || b.s.winRate - a.s.winRate)[0];

  if (risingCandidate) {
    awards.push({
      id: 'rising_star',
      badge: '人气黑马',
      title: '越级逆袭之星',
      subtitle: `DUPR ${risingCandidate.s.player.rating.toFixed(1)} 强势冲至第 ${risingCandidate.s.rank} 名`,
      metricLabel: '排名跃升',
      metricValue: `↑${risingCandidate.climb}位`,
      playerIds: [risingCandidate.s.player.id],
      playerNames: [risingCandidate.s.player.name],
      accentColor: '#C084FC',
      slogan: `打破账面评级上限，用实战表现惊艳全场的超级黑马！`,
    });
  }

  return awards;
}

/**
 * Returns a tailored emotional honor profile for ANY player so every participant can generate
 * their own personalized high-pride highlight poster!
 */
export function getPlayerHonorProfile(
  standing: PlayerStanding,
  awards: HonorAward[]
): PlayerHonorProfile {
  const playerAwards = awards.filter((a) => a.playerIds.includes(standing.player.id));
  if (playerAwards.length > 0) {
    return {
      primaryBadge: playerAwards[0].badge,
      primaryTitle: playerAwards[0].title,
      slogan: playerAwards[0].slogan,
      awards: playerAwards,
    };
  }

  if (standing.rank === 2) {
    return {
      primaryBadge: '全场亚军',
      primaryTitle: '银牌王牌球手',
      slogan: `稳定输出、气场全开，以第 2 名之姿闪耀本场转转赛！`,
      awards: [],
    };
  }
  if (standing.rank === 3) {
    return {
      primaryBadge: '全场季军',
      primaryTitle: '领奖台常客',
      slogan: `稳居三甲之列，每一拍都在证明硬核球场统治力！`,
      awards: [],
    };
  }
  if (standing.winRate >= 0.5) {
    return {
      primaryBadge: '胜率担当',
      primaryTitle: '高能节奏掌控者',
      slogan: `保持高水准竞技状态，在多轮轮转中打出精彩配合！`,
      awards: [],
    };
  }
  return {
    primaryBadge: '活力球友',
    primaryTitle: '球场氛围担当',
    slogan: `享受每一回合挥拍与汗水，这就是匹克球最迷人的快乐！`,
    awards: [],
  };
}
