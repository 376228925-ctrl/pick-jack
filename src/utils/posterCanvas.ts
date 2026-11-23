import type {
  PlayerStanding,
  ScheduleFairnessReport,
  TournamentFormat,
  TournamentState,
} from '../types/tournament';
import type { PosterCopyResult } from './aiAnalysis';
import {
  computeTournamentAwards,
  getPlayerHonorProfile,
  type HonorAward,
} from './awardsEngine';
import { resolvePlayerAvatar } from './avatarUtils';

export type PosterTheme = 'magazine' | 'polaroid' | 'obsidian_gold';

export const DEFAULT_POSTER_HERO_URL = '/src/assets/images/sunset_coastal_court_1795082351552.jpg';

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  classic: '经典全员转',
  balanced: '水平均衡转',
  mixed: '混双优选转',
  mexicano: '胜者升场制',
  ai_smart: 'AI 智适应排阵',
};

const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif';
const SERIF = '"Songti SC", "STSong", "Noto Serif SC", Georgia, serif';
const CONDENSED = '"DIN Condensed", "Arial Narrow", "PingFang SC", sans-serif';
const MONO = '"SF Mono", ui-monospace, Menlo, Consolas, monospace';

function loadImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const boxRatio = dw / dh;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (imgRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / boxRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawCircularAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  radius: number,
  initial: string,
  bgColor: string,
  textColor: string,
  ringColor?: string,
  ringWidth = 2
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (img) {
    drawCoverImage(ctx, img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = bgColor;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = textColor;
    ctx.font = `700 ${Math.round(radius * 0.92)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial.slice(0, 1).toUpperCase(), cx, cy + 1);
  }
  ctx.restore();

  if (ringColor) {
    ctx.save();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + ringWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCrownIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy + 8);
  ctx.lineTo(cx - 16, cy - 6);
  ctx.lineTo(cx - 6, cy + 1);
  ctx.lineTo(cx, cy - 10);
  ctx.lineTo(cx + 6, cy + 1);
  ctx.lineTo(cx + 16, cy - 6);
  ctx.lineTo(cx + 14, cy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  align: CanvasTextAlign = 'left'
): number {
  ctx.textAlign = align;
  const chars = Array.from(text);
  let line = '';
  let lineCount = 0;
  let currentY = y;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
      lineCount += 1;
      if (lineCount === maxLines) {
        ctx.fillText(line.slice(0, Math.max(1, line.length - 1)) + '…', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = chars[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function formatTodayDate(sessionDate?: string): string {
  if (sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return sessionDate.replace(/-/g, '.');
  }
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function getDefaultPosterCopy(
  state: TournamentState,
  standings: PlayerStanding[]
): PosterCopyResult {
  const mvp = standings[0];
  return {
    coverTitle: state.config.title,
    coverSub: `${state.config.venue || '城市匹克球俱乐部'} · ${FORMAT_LABELS[state.config.format]}`,
    mvpQuote:
      mvp && mvp.played > 0
        ? `${mvp.player.name} 以 ${mvp.wins} 胜 ${
            mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : mvp.pointDiff
          } 净胜分加冕今日球场焦点，与球友共赴一场酣畅淋漓的旋转对决。`
        : '阳光、球拍与默契搭档，每一拍都在定格球场高光时刻。',
  };
}

interface DrawPayload {
  state: TournamentState;
  standings: PlayerStanding[];
  mvp: PlayerStanding | null;
  completedMatches: number;
  totalMatches: number;
  fairness: ScheduleFairnessReport;
  copy: PosterCopyResult;
  dateLabel: string;
  heroImg: HTMLImageElement | null;
  avatarImgs: Map<string, HTMLImageElement | null>;
  bestDuo: HonorAward | null;
}

/**
 * Generates a 2x Retina (960x1520) gallery-grade editorial sports poster PNG.
 * Three curated styles designed for Xiaohongshu & WeChat Moments sharing:
 * 1. magazine: Warm ivory fine-art editorial magazine cover
 * 2. polaroid: Archival cream film print with full-bleed photo & frosted glass MVP card
 * 3. obsidian_gold: Matte obsidian & champagne-gold championship honors edition
 */
export async function renderPosterToDataUrl(
  state: TournamentState,
  standings: PlayerStanding[],
  fairness: ScheduleFairnessReport,
  theme: PosterTheme = 'magazine',
  aiCopy?: PosterCopyResult | null,
  heroImageUrl?: string,
  avatarsByName?: Record<string, string>
): Promise<string> {
  const scale = 2;
  const width = 480;
  const height = 760;
  const copy = aiCopy ?? getDefaultPosterCopy(state, standings);
  const awards = computeTournamentAwards(state, standings);
  const bestDuo = awards.find((a) => a.id === 'best_duo') ?? null;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.scale(scale, scale);

  const visibleRows = standings.slice(0, 6);
  const heroImg = await loadImage(heroImageUrl || DEFAULT_POSTER_HERO_URL);

  const avatarImgs = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    visibleRows.map(async (row) => {
      const src = resolvePlayerAvatar(row.player.name, row.player.avatarUrl, avatarsByName);
      const loaded = await loadImage(src);
      avatarImgs.set(row.player.id, loaded);
    })
  );

  const completedMatches = state.rounds.reduce(
    (sum, r) => sum + r.matches.filter((m) => m.status === 'completed').length,
    0
  );
  const totalMatches = state.rounds.reduce((sum, r) => sum + r.matches.length, 0);
  const dateLabel = formatTodayDate(state.sessionDate);

  const payload: DrawPayload = {
    state,
    standings: visibleRows,
    mvp: standings[0] ?? null,
    completedMatches,
    totalMatches,
    fairness,
    copy,
    dateLabel,
    heroImg,
    avatarImgs,
    bestDuo,
  };

  if (theme === 'magazine') {
    drawMagazinePoster(ctx, width, height, payload);
  } else if (theme === 'polaroid') {
    drawPolaroidPoster(ctx, width, height, payload);
  } else {
    drawObsidianGoldPoster(ctx, width, height, payload);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Generates a 2x Retina (960x1520) Personal Highlight Honor Card PNG for ANY player
 * with giant circular portrait avatar, metallic crown & medal ring, bespoke honor title,
 * big stats triad, best partner badge, and scenic full-bleed court photography.
 */
export async function renderPersonalSpotlightPosterToDataUrl(
  state: TournamentState,
  standing: PlayerStanding,
  awards: HonorAward[],
  heroImageUrl?: string,
  avatarsByName?: Record<string, string>,
  customQuote?: string
): Promise<string> {
  const scale = 2;
  const w = 480;
  const h = 760;

  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.scale(scale, scale);

  const profile = getPlayerHonorProfile(standing, awards);
  const dateLabel = formatTodayDate(state.sessionDate);
  const heroImg = await loadImage(heroImageUrl || DEFAULT_POSTER_HERO_URL);
  const avatarSrc = resolvePlayerAvatar(
    standing.player.name,
    standing.player.avatarUrl,
    avatarsByName
  );
  const playerAvatarImg = await loadImage(avatarSrc);

  // Best partner lookup from completed matches
  const partnerScores = new Map<string, { id: string; name: string; wins: number; games: number }>();
  const playerMap = new Map(state.players.map((p) => [p.id, p]));
  for (const r of state.rounds) {
    for (const m of r.matches) {
      if (m.status !== 'completed' || m.scoreA === null || m.scoreB === null) continue;
      const inA = m.teamA.includes(standing.player.id);
      const inB = m.teamB.includes(standing.player.id);
      if (!inA && !inB) continue;
      const team = inA ? m.teamA : m.teamB;
      const won = inA ? m.scoreA > m.scoreB : m.scoreB > m.scoreA;
      const partnerId = team.find((id) => id !== standing.player.id);
      if (!partnerId) continue;
      const prev = partnerScores.get(partnerId) ?? {
        id: partnerId,
        name: playerMap.get(partnerId)?.name ?? '球友',
        wins: 0,
        games: 0,
      };
      prev.games += 1;
      if (won) prev.wins += 1;
      partnerScores.set(partnerId, prev);
    }
  }
  const bestPartner = Array.from(partnerScores.values()).sort(
    (a, b) => b.wins - a.wins || b.games - a.games
  )[0];
  const partnerPlayer = bestPartner ? playerMap.get(bestPartner.id) : null;
  const partnerImg = bestPartner
    ? await loadImage(
        resolvePlayerAvatar(bestPartner.name, partnerPlayer?.avatarUrl, avatarsByName)
      )
    : null;

  // 1. Full-Bleed Scenic Court Photography Backdrop
  if (heroImg) {
    drawCoverImage(ctx, heroImg, 0, 0, w, h);
  } else {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1B2D4F');
    bg.addColorStop(1, '#0C111C');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  // Deep atmospheric cinema scrim for ultra-crisp editorial legibility
  const scrim = ctx.createLinearGradient(0, 0, 0, h);
  scrim.addColorStop(0, 'rgba(11, 15, 24, 0.56)');
  scrim.addColorStop(0.38, 'rgba(11, 15, 24, 0.62)');
  scrim.addColorStop(0.72, 'rgba(11, 15, 24, 0.90)');
  scrim.addColorStop(1, 'rgba(9, 12, 19, 0.97)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, w, h);

  // Subtle champagne gold editorial frame
  const medalColor =
    standing.rank === 1
      ? '#F5C451'
      : standing.rank === 2
      ? '#E2E8F0'
      : standing.rank === 3
      ? '#E59B6B'
      : '#F5C451';

  ctx.strokeStyle = 'rgba(245, 196, 81, 0.34)';
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // 2. Top Masthead
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.font = `700 10.5px ${MONO}`;
  ctx.fillText('PLAYER SPOTLIGHT · 个人高光荣耀卡', 34, 48);
  ctx.textAlign = 'right';
  ctx.fillStyle = medalColor;
  ctx.fillText(dateLabel, w - 34, 48);

  // 3. Crown + Giant Circular Portrait Avatar with Halo Glow
  const avatarCy = 188;
  const glow = ctx.createRadialGradient(w / 2, avatarCy, 42, w / 2, avatarCy, 118);
  glow.addColorStop(0, 'rgba(245, 196, 81, 0.34)');
  glow.addColorStop(1, 'rgba(245, 196, 81, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(w / 2, avatarCy, 118, 0, Math.PI * 2);
  ctx.fill();

  drawCrownIcon(ctx, w / 2, avatarCy - 84, medalColor);

  drawCircularAvatar(
    ctx,
    playerAvatarImg,
    w / 2,
    avatarCy,
    62,
    standing.player.name,
    '#1F2937',
    '#FFFFFF',
    medalColor,
    4
  );

  // Rank Medallion Stamp Overlapping Avatar Bottom
  ctx.fillStyle = medalColor;
  drawRoundedRectPath(ctx, w / 2 - 44, avatarCy + 48, 88, 24, 12);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = `800 12px ${MONO}`;
  ctx.fillText(`NO.${String(standing.rank).padStart(2, '0')} · TOP`, w / 2, avatarCy + 64);

  // 4. Honor Title & Player Name
  ctx.fillStyle = medalColor;
  ctx.font = `700 13px ${SANS}`;
  ctx.fillText(`${profile.primaryBadge} · ${profile.primaryTitle}`, w / 2, 294);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 34px ${SANS}`;
  ctx.fillText(standing.player.name.slice(0, 12), w / 2, 336);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `500 12px ${SANS}`;
  ctx.fillText(
    `${state.config.title.slice(0, 16)} · ${FORMAT_LABELS[state.config.format]}`,
    w / 2,
    362
  );

  // 5. Glassmorphic Giant Stats Triad Card
  const cardX = 34;
  const cardY = 390;
  const cardW = w - 68;
  const cardH = 112;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const stats = [
    {
      label: '本场战绩',
      value: `${standing.wins}胜${standing.losses}负`,
      color: '#FFFFFF',
    },
    {
      label: '本场胜率',
      value: standing.played > 0 ? `${Math.round(standing.winRate * 100)}%` : '--',
      color: medalColor,
    },
    {
      label: '净胜分差',
      value: standing.pointDiff > 0 ? `+${standing.pointDiff}` : `${standing.pointDiff}`,
      color: standing.pointDiff >= 0 ? '#34E39C' : '#FF8A75',
    },
  ];

  const colW = cardW / 3;
  stats.forEach((st, idx) => {
    const cx = cardX + colW * idx + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = st.color;
    ctx.font = `800 30px ${CONDENSED}`;
    ctx.fillText(st.value, cx, cardY + 58);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = `500 11px ${SANS}`;
    ctx.fillText(st.label, cx, cardY + 86);

    if (idx < 2) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(cardX + colW * (idx + 1), cardY + 24);
      ctx.lineTo(cardX + colW * (idx + 1), cardY + cardH - 24);
      ctx.stroke();
    }
  });

  // 6. Best Partner Synergy Strip (if available)
  let quoteTop = 536;
  if (bestPartner) {
    const duoY = 520;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    drawRoundedRectPath(ctx, 34, duoY, w - 68, 56, 16);
    ctx.fill();
    drawCircularAvatar(
      ctx,
      partnerImg,
      66,
      duoY + 28,
      18,
      bestPartner.name,
      '#334155',
      '#FFFFFF',
      '#7CC2FF',
      1.8
    );
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7CC2FF';
    ctx.font = `700 10.5px ${SANS}`;
    ctx.fillText('本场默契拍档', 96, duoY + 23);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 14px ${SANS}`;
    ctx.fillText(bestPartner.name.slice(0, 10), 96, duoY + 43);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.font = `600 11.5px ${MONO}`;
    ctx.fillText(`搭档 ${bestPartner.wins}胜/${bestPartner.games}场`, w - 48, duoY + 33);
    quoteTop = 608;
  }

  // 7. Celebratory Editorial Quote
  const quoteText = customQuote || profile.slogan;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.font = `500 13.5px ${SERIF}`;
  drawWrappedText(ctx, `“${quoteText}”`, w / 2, quoteTop, w - 84, 22, 3, 'center');

  // 8. Club Colophon Footer
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.moveTo(34, h - 56);
  ctx.lineTo(w - 34, h - 56);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.font = `500 11px ${SANS}`;
  ctx.fillText(state.config.venue || '轻转匹克球俱乐部', 34, h - 32);

  ctx.textAlign = 'right';
  ctx.fillStyle = medalColor;
  ctx.font = `700 11px ${MONO}`;
  ctx.fillText('轻转匹克 · QINGZHUAN', w - 34, h - 32);

  return canvas.toDataURL('image/png');
}

function drawMagazinePoster(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: DrawPayload
) {
  const { standings, mvp, completedMatches, totalMatches, copy, dateLabel, heroImg, avatarImgs, state } = data;

  // 1. Warm Ivory Gallery Paper
  ctx.fillStyle = '#F7F3EC';
  ctx.fillRect(0, 0, w, h);

  // Subtle top editorial masthead
  ctx.fillStyle = '#18181B';
  ctx.font = `700 11px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('THE PICKLEBALL JOURNAL', 28, 34);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#78716C';
  ctx.fillText(`ISSUE ${dateLabel}`, w - 28, 34);

  // Thin editorial rule
  ctx.strokeStyle = 'rgba(24, 24, 27, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, 46);
  ctx.lineTo(w - 28, 46);
  ctx.stroke();

  // 2. Crisp Rounded Full-Width Scenic Court Photography (300px tall)
  const photoX = 28;
  const photoY = 60;
  const photoW = w - 56;
  const photoH = 296;

  ctx.save();
  drawRoundedRectPath(ctx, photoX, photoY, photoW, photoH, 20);
  ctx.clip();
  if (heroImg) {
    drawCoverImage(ctx, heroImg, photoX, photoY, photoW, photoH);
  } else {
    const g = ctx.createLinearGradient(photoX, photoY, photoX + photoW, photoY + photoH);
    g.addColorStop(0, '#E89578');
    g.addColorStop(1, '#2D527C');
    ctx.fillStyle = g;
    ctx.fillRect(photoX, photoY, photoW, photoH);
  }
  // Soft cinematic bottom scrim inside photo only
  const scrim = ctx.createLinearGradient(0, photoY + 120, 0, photoY + photoH);
  scrim.addColorStop(0, 'rgba(15, 20, 28, 0)');
  scrim.addColorStop(1, 'rgba(15, 20, 28, 0.72)');
  ctx.fillStyle = scrim;
  ctx.fillRect(photoX, photoY, photoW, photoH);

  // Translucent magazine title inside photo
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.font = `800 44px ${CONDENSED}`;
  ctx.textAlign = 'left';
  ctx.fillText('CLUB EDITION', photoX + 20, photoY + 52);

  // Clean headline anchored cleanly to bottom-left of photo
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 24px ${SANS}`;
  drawWrappedText(ctx, copy.coverTitle, photoX + 22, photoY + photoH - 48, photoW - 44, 30, 2);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `500 11.5px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText(copy.coverSub.slice(0, 32), photoX + 22, photoY + photoH - 18);
  ctx.restore();

  // 3. Elevated MVP Feature Strip (Clean White Card with Circular Avatar)
  const mvpY = 374;
  ctx.save();
  ctx.shadowColor = 'rgba(24, 24, 27, 0.06)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRectPath(ctx, 28, mvpY, w - 56, 92, 18);
  ctx.fill();
  ctx.restore();

  if (mvp) {
    drawCircularAvatar(
      ctx,
      avatarImgs.get(mvp.player.id) ?? null,
      68,
      mvpY + 46,
      26,
      mvp.player.name,
      '#1F2937',
      '#FFFFFF',
      '#D97757',
      2.5
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = '#D97757';
    ctx.font = `700 10px ${MONO}`;
    ctx.fillText('CHAMPION · 本场焦点球手', 108, mvpY + 28);

    ctx.fillStyle = '#18181B';
    ctx.font = `800 22px ${SANS}`;
    ctx.fillText(mvp.player.name.slice(0, 10), 108, mvpY + 56);

    ctx.fillStyle = '#78716C';
    ctx.font = `500 11.5px ${SANS}`;
    ctx.fillText(
      `${mvp.wins}胜 ${mvp.losses}负 · 胜率 ${Math.round(mvp.winRate * 100)}%`,
      108,
      mvpY + 76
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#18181B';
    ctx.font = `700 40px ${CONDENSED}`;
    ctx.fillText(mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : `${mvp.pointDiff}`, w - 46, mvpY + 54);
    ctx.fillStyle = '#78716C';
    ctx.font = `500 10px ${SANS}`;
    ctx.fillText('净胜分差', w - 46, mvpY + 73);
  }

  // 4. Refined Pull-Quote on Paper
  ctx.fillStyle = '#57534E';
  ctx.font = `500 12.5px ${SERIF}`;
  drawWrappedText(ctx, `“${copy.mvpQuote}”`, 32, 494, w - 64, 20, 2, 'left');

  // 5. Airy Top-6 Leaderboard (Generous spacing, mini circular avatars)
  const listTop = 542;
  ctx.strokeStyle = 'rgba(24, 24, 27, 0.12)';
  ctx.beginPath();
  ctx.moveTo(28, listTop - 10);
  ctx.lineTo(w - 28, listTop - 10);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#78716C';
  ctx.font = `600 10px ${MONO}`;
  ctx.fillText('HONOR ROLL · 积分荣誉榜', 28, listTop + 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${completedMatches}/${totalMatches} MATCHES · ${state.config.targetScore}分制`, w - 28, listTop + 6);

  const colW = (w - 56 - 24) / 2;
  const rows = standings.slice(0, 6);
  rows.forEach((row, idx) => {
    const col = idx < 3 ? 0 : 1;
    const r = idx % 3;
    const x = 28 + col * (colW + 24);
    const y = listTop + 26 + r * 48;

    drawCircularAvatar(
      ctx,
      avatarImgs.get(row.player.id) ?? null,
      x + 15,
      y + 18,
      14,
      row.player.name,
      row.rank === 1 ? '#D97757' : '#27272A',
      '#FFFFFF'
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = '#18181B';
    ctx.font = `700 13.5px ${SANS}`;
    ctx.fillText(`${row.rank}. ${row.player.name.slice(0, 5)}`, x + 36, y + 16);

    ctx.fillStyle = '#78716C';
    ctx.font = `500 10.5px ${MONO}`;
    ctx.fillText(`${row.wins}W-${row.losses}L · ${row.player.rating.toFixed(1)}`, x + 36, y + 32);

    ctx.textAlign = 'right';
    ctx.fillStyle = row.pointDiff > 0 ? '#15803D' : row.pointDiff < 0 ? '#C2410C' : '#78716C';
    ctx.font = `700 18px ${CONDENSED}`;
    ctx.fillText(row.pointDiff > 0 ? `+${row.pointDiff}` : `${row.pointDiff}`, x + colW, y + 24);

    if (r < 2) {
      ctx.strokeStyle = 'rgba(24, 24, 27, 0.08)';
      ctx.beginPath();
      ctx.moveTo(x, y + 43);
      ctx.lineTo(x + colW, y + 43);
      ctx.stroke();
    }
  });

  // 6. Minimal Editorial Colophon Footer
  ctx.strokeStyle = 'rgba(24, 24, 27, 0.12)';
  ctx.beginPath();
  ctx.moveTo(28, h - 46);
  ctx.lineTo(w - 28, h - 46);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#78716C';
  ctx.font = `500 10.5px ${SANS}`;
  ctx.fillText(state.config.venue || '轻转匹克球俱乐部', 28, h - 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#18181B';
  ctx.font = `700 10.5px ${MONO}`;
  ctx.fillText('QINGZHUAN PICKLEBALL', w - 28, h - 22);
}

function drawPolaroidPoster(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: DrawPayload
) {
  const { standings, mvp, copy, dateLabel, heroImg, avatarImgs, state } = data;

  // 1. Soft Gallery Cream Backdrop
  ctx.fillStyle = '#FAF7F1';
  ctx.fillRect(0, 0, w, h);

  // Subtle archival frame border
  ctx.strokeStyle = 'rgba(28, 25, 23, 0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // 2. Expansive Polaroid Photo Window (Top 430px)
  const px = 26;
  const py = 26;
  const pw = w - 52;
  const ph = 420;

  ctx.save();
  drawRoundedRectPath(ctx, px, py, pw, ph, 14);
  ctx.clip();
  if (heroImg) {
    drawCoverImage(ctx, heroImg, px, py, pw, ph);
  } else {
    ctx.fillStyle = '#2A4365';
    ctx.fillRect(px, py, pw, ph);
  }

  // Soft warm film vignette
  const grad = ctx.createLinearGradient(0, py, 0, py + ph);
  grad.addColorStop(0, 'rgba(12, 16, 24, 0.25)');
  grad.addColorStop(0.55, 'rgba(12, 16, 24, 0.05)');
  grad.addColorStop(1, 'rgba(12, 16, 24, 0.65)');
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, pw, ph);

  // Top Film Camera Date Stamp
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = `600 11px ${MONO}`;
  ctx.fillText('MATCH DAY MEMORY', px + 20, py + 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FCD34D';
  ctx.fillText(dateLabel, px + pw - 20, py + 30);

  // Frosted Glass MVP Spotlight Card nestled inside bottom of photo
  if (mvp) {
    const cardX = px + 18;
    const cardY = py + ph - 102;
    const cardW = pw - 36;
    const cardH = 82;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fill();

    drawCircularAvatar(
      ctx,
      avatarImgs.get(mvp.player.id) ?? null,
      cardX + 38,
      cardY + 41,
      24,
      mvp.player.name,
      '#1C1917',
      '#FFFFFF',
      '#FFFFFF',
      2
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = '#78716C';
    ctx.font = `700 10px ${MONO}`;
    ctx.fillText('MVP OF THE SESSION', cardX + 74, cardY + 26);

    ctx.fillStyle = '#1C1917';
    ctx.font = `800 20px ${SANS}`;
    ctx.fillText(mvp.player.name.slice(0, 10), cardX + 74, cardY + 52);

    ctx.fillStyle = '#57534E';
    ctx.font = `500 11px ${SANS}`;
    ctx.fillText(`${mvp.wins}胜 ${mvp.losses}负 · 胜率 ${Math.round(mvp.winRate * 100)}%`, cardX + 74, cardY + 70);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#1C1917';
    ctx.font = `700 36px ${CONDENSED}`;
    ctx.fillText(mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : `${mvp.pointDiff}`, cardX + cardW - 18, cardY + 54);
  }
  ctx.restore();

  // 3. Polaroid Handwritten-Style Title & Whisper-Clean Caption
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1C1917';
  ctx.font = `700 22px ${SERIF}`;
  ctx.fillText(copy.coverTitle.slice(0, 18), 30, 484);

  ctx.fillStyle = '#78716C';
  ctx.font = `500 12px ${SANS}`;
  drawWrappedText(ctx, copy.mvpQuote, 30, 508, w - 60, 18, 2, 'left');

  // 4. Minimalist Podium Strip (Top 4 avatars side-by-side in clean polaroid style)
  const stripY = 562;
  const topFour = standings.slice(0, 4);
  const slotW = (w - 60) / Math.max(1, topFour.length);
  topFour.forEach((row, idx) => {
    const cx = 30 + slotW * idx + slotW / 2;
    drawCircularAvatar(
      ctx,
      avatarImgs.get(row.player.id) ?? null,
      cx,
      stripY + 26,
      24,
      row.player.name,
      idx === 0 ? '#C2410C' : '#292524',
      '#FFFFFF',
      idx === 0 ? '#D97757' : 'rgba(28, 25, 23, 0.14)',
      2
    );

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1C1917';
    ctx.font = `700 12.5px ${SANS}`;
    ctx.fillText(row.player.name.slice(0, 4), cx, stripY + 70);

    ctx.fillStyle = '#78716C';
    ctx.font = `600 10.5px ${MONO}`;
    ctx.fillText(
      `#${row.rank} · ${row.pointDiff >= 0 ? `+${row.pointDiff}` : row.pointDiff}`,
      cx,
      stripY + 88
    );
  });

  // 5. Clean Archival Footer
  ctx.strokeStyle = 'rgba(28, 25, 23, 0.1)';
  ctx.beginPath();
  ctx.moveTo(30, h - 54);
  ctx.lineTo(w - 30, h - 54);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#78716C';
  ctx.font = `500 11px ${SANS}`;
  ctx.fillText(`${state.config.venue || '匹克球场'} · ${FORMAT_LABELS[state.config.format]}`, 30, h - 26);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#1C1917';
  ctx.font = `700 11px ${MONO}`;
  ctx.fillText('轻转匹克', w - 30, h - 26);
}

function drawObsidianGoldPoster(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: DrawPayload
) {
  const { standings, mvp, completedMatches, totalMatches, copy, dateLabel, heroImg, avatarImgs, state } = data;

  // 1. Matte Obsidian Canvas
  ctx.fillStyle = '#0F1115';
  ctx.fillRect(0, 0, w, h);

  // Subtle Champagne Gold Outer Hairline
  ctx.strokeStyle = 'rgba(232, 201, 136, 0.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // 2. Top Atmospheric Court Photo Fade (250px)
  const photoH = 250;
  ctx.save();
  ctx.beginPath();
  ctx.rect(19, 19, w - 38, photoH);
  ctx.clip();
  if (heroImg) {
    drawCoverImage(ctx, heroImg, 19, 19, w - 38, photoH);
  }
  const scrim = ctx.createLinearGradient(0, 19, 0, 19 + photoH);
  scrim.addColorStop(0, 'rgba(15, 17, 21, 0.42)');
  scrim.addColorStop(0.7, 'rgba(15, 17, 21, 0.72)');
  scrim.addColorStop(1, '#0F1115');
  ctx.fillStyle = scrim;
  ctx.fillRect(19, 19, w - 38, photoH + 2);
  ctx.restore();

  // Gold Masthead
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E8C988';
  ctx.font = `700 10.5px ${MONO}`;
  ctx.fillText(`CHAMPIONSHIP HONORS · ${dateLabel}`, w / 2, 52);

  // Centered Editorial Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 24px ${SERIF}`;
  drawWrappedText(ctx, copy.coverTitle, w / 2, 92, w - 88, 32, 2, 'center');

  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `500 11.5px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText(copy.coverSub.slice(0, 32), w / 2, 148);

  // 3. Centered Champion Avatar Medallion overlapping horizon
  if (mvp) {
    drawCircularAvatar(
      ctx,
      avatarImgs.get(mvp.player.id) ?? null,
      w / 2,
      218,
      40,
      mvp.player.name,
      '#1C1F26',
      '#E8C988',
      '#E8C988',
      2.5
    );

    ctx.textAlign = 'center';
    ctx.fillStyle = '#E8C988';
    ctx.font = `700 10px ${MONO}`;
    ctx.fillText('NO.01 · MVP CHAMPION', w / 2, 282);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 26px ${SANS}`;
    ctx.fillText(mvp.player.name, w / 2, 314);

    ctx.fillStyle = 'rgba(232, 201, 136, 0.9)';
    ctx.font = `600 12px ${MONO}`;
    ctx.fillText(
      `${mvp.wins}W-${mvp.losses}L  ·  NET ${mvp.pointDiff >= 0 ? `+${mvp.pointDiff}` : mvp.pointDiff}  ·  ${Math.round(mvp.winRate * 100)}% WIN`,
      w / 2,
      338
    );
  }

  // Subtle gold divider
  ctx.strokeStyle = 'rgba(232, 201, 136, 0.28)';
  ctx.beginPath();
  ctx.moveTo(84, 360);
  ctx.lineTo(w - 84, 360);
  ctx.stroke();

  // Centered Quote
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.font = `500 12px ${SERIF}`;
  drawWrappedText(ctx, `“${copy.mvpQuote}”`, w / 2, 386, w - 92, 19, 2, 'center');

  // 4. Clean Single-Column Luxury Top-5 Ranking
  const listStart = 442;
  const rows = standings.slice(0, 5);
  rows.forEach((row, idx) => {
    const y = listStart + idx * 50;

    ctx.textAlign = 'left';
    ctx.fillStyle = idx === 0 ? '#E8C988' : 'rgba(255, 255, 255, 0.45)';
    ctx.font = `700 19px ${CONDENSED}`;
    ctx.fillText(String(row.rank).padStart(2, '0'), 42, y + 25);

    drawCircularAvatar(
      ctx,
      avatarImgs.get(row.player.id) ?? null,
      90,
      y + 19,
      15,
      row.player.name,
      '#1F242D',
      '#FFFFFF',
      idx === 0 ? '#E8C988' : 'rgba(255,255,255,0.2)',
      1.5
    );

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 14px ${SANS}`;
    ctx.fillText(row.player.name.slice(0, 8), 118, y + 17);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = `500 10.5px ${MONO}`;
    ctx.fillText(`${row.wins}W-${row.losses}L · DUPR ${row.player.rating.toFixed(1)}`, 118, y + 33);

    ctx.textAlign = 'right';
    ctx.fillStyle = row.pointDiff > 0 ? '#E8C988' : row.pointDiff < 0 ? '#F87171' : '#94A3B8';
    ctx.font = `700 20px ${CONDENSED}`;
    ctx.fillText(row.pointDiff > 0 ? `+${row.pointDiff}` : `${row.pointDiff}`, w - 42, y + 25);

    if (idx < rows.length - 1) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(42, y + 44);
      ctx.lineTo(w - 42, y + 44);
      ctx.stroke();
    }
  });

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(232, 201, 136, 0.7)';
  ctx.font = `600 10px ${MONO}`;
  ctx.fillText(
    `${completedMatches}/${totalMatches} MATCHES · ${state.config.targetScore} PTS · 轻转匹克`,
    w / 2,
    h - 36
  );
}
