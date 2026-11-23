import type { UserAccount } from '../types/tournament';

export interface PresetAvatar {
  id: string;
  label: string;
  dataUrl: string;
}

function makeSvgAvatar(bgA: string, bgB: string, accent: string, motif: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgA}"/>
        <stop offset="100%" stop-color="${bgB}"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" fill="url(#g)"/>
    <circle cx="128" cy="30" r="44" fill="${accent}" opacity="0.18"/>
    <circle cx="24" cy="142" r="36" fill="#FFFFFF" opacity="0.1"/>
    ${motif}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Curated minimal sports-club avatar presets (100% local SVG data URLs, instant offline load in China).
 */
export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'sunset-paddle',
    label: '日落球拍',
    dataUrl: makeSvgAvatar(
      '#FF7E5F',
      '#2B4C7E',
      '#FFF3D6',
      `<rect x="64" y="34" width="44" height="58" rx="18" transform="rotate(24 86 63)" fill="#FFF8EE" stroke="#1E293B" stroke-width="3.5"/>
       <rect x="66" y="90" width="12" height="32" rx="5" transform="rotate(24 72 106)" fill="#1E293B"/>
       <circle cx="110" cy="108" r="14" fill="#FFE066" stroke="#1E293B" stroke-width="3"/>
       <circle cx="106" cy="104" r="2" fill="#1E293B"/><circle cx="114" cy="106" r="2" fill="#1E293B"/><circle cx="109" cy="113" r="2" fill="#1E293B"/>`
    ),
  },
  {
    id: 'emerald-court',
    label: '庄园绿茵',
    dataUrl: makeSvgAvatar(
      '#1F6F54',
      '#0E3B2C',
      '#DDF26B',
      `<rect x="30" y="42" width="100" height="76" rx="10" fill="none" stroke="#F7F5EE" stroke-width="3.5"/>
       <line x1="80" y1="42" x2="80" y2="118" stroke="#DDF26B" stroke-width="3.5"/>
       <line x1="60" y1="42" x2="60" y2="118" stroke="#F7F5EE" stroke-width="2" opacity="0.7"/>
       <line x1="100" y1="42" x2="100" y2="118" stroke="#F7F5EE" stroke-width="2" opacity="0.7"/>
       <circle cx="108" cy="64" r="10" fill="#DDF26B"/>`
    ),
  },
  {
    id: 'terracotta-ace',
    label: '法网红土',
    dataUrl: makeSvgAvatar(
      '#C95432',
      '#6E2918',
      '#F8E5C2',
      `<circle cx="80" cy="80" r="44" fill="none" stroke="#F8E5C2" stroke-width="3" opacity="0.85"/>
       <path d="M48 104 Q80 54 112 104" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"/>
       <circle cx="80" cy="58" r="14" fill="#FDE047"/>`
    ),
  },
  {
    id: 'ocean-smash',
    label: '海风重扣',
    dataUrl: makeSvgAvatar(
      '#1A5AA8',
      '#0B2347',
      '#7CE4FF',
      `<path d="M24 108 Q54 88 80 104 T136 96" fill="none" stroke="#7CE4FF" stroke-width="4" stroke-linecap="round"/>
       <path d="M36 74 L86 42 L118 68" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="118" cy="68" r="11" fill="#D4FF2B"/>`
    ),
  },
  {
    id: 'gold-crown',
    label: '冠军金徽',
    dataUrl: makeSvgAvatar(
      '#24201B',
      '#0F0D0A',
      '#E8C988',
      `<path d="M38 104 L46 58 L80 78 L114 58 L122 104 Z" fill="none" stroke="#E8C988" stroke-width="4" stroke-linejoin="round"/>
       <circle cx="46" cy="52" r="5" fill="#E8C988"/><circle cx="80" cy="46" r="6" fill="#E8C988"/><circle cx="114" cy="52" r="5" fill="#E8C988"/>
       <line x1="42" y1="114" x2="118" y2="114" stroke="#E8C988" stroke-width="3.5" stroke-linecap="round"/>`
    ),
  },
  {
    id: 'minimal-ball',
    label: '极简匹克',
    dataUrl: makeSvgAvatar(
      '#F3EFE6',
      '#DFD7C8',
      '#18181B',
      `<circle cx="80" cy="80" r="38" fill="#18181B"/>
       <circle cx="66" cy="68" r="5" fill="#F3EFE6"/><circle cx="94" cy="68" r="5" fill="#F3EFE6"/>
       <circle cx="80" cy="82" r="5" fill="#D4FF2B"/><circle cx="66" cy="96" r="5" fill="#F3EFE6"/><circle cx="94" cy="96" r="5" fill="#F3EFE6"/>`
    ),
  },
  {
    id: 'twilight-violet',
    label: '暮光紫霞',
    dataUrl: makeSvgAvatar(
      '#6D28D9',
      '#2E1065',
      '#F5D0FE',
      `<circle cx="80" cy="80" r="42" fill="none" stroke="#F5D0FE" stroke-width="3" opacity="0.8"/>
       <polygon points="80,44 90,68 116,70 96,86 102,112 80,98 58,112 64,86 44,70 70,68" fill="#FDE047"/>`
    ),
  },
  {
    id: 'mint-volley',
    label: '清风网前',
    dataUrl: makeSvgAvatar(
      '#0D9488',
      '#134E4A',
      '#CCFBF1',
      `<path d="M32 98 Q80 42 128 98" fill="none" stroke="#CCFBF1" stroke-width="4" stroke-linecap="round"/>
       <line x1="32" y1="98" x2="128" y2="98" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="6 5"/>
       <circle cx="80" cy="54" r="13" fill="#FDE047"/>`
    ),
  },
];

/**
 * Center-crops and compresses any uploaded image file into a crisp 240x240 JPEG Data URL (< ~20KB),
 * ideal for fast localStorage + Cloudflare KV syncing and Retina Canvas poster rendering.
 */
export function compressAvatarFile(file: File, size = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择 JPG、PNG 或 WebP 图片文件'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片格式无法解析'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('浏览器不支持图片处理'));
          return;
        }
        const minSide = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - minSide) / 2;
        const sy = (img.naturalHeight - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Builds a lowercase-name -> avatarUrl lookup from registered accounts so players in matches,
 * standings, and posters automatically display their synced avatars.
 */
export function buildAvatarLookup(users: UserAccount[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const u of users) {
    if (!u.avatarUrl) continue;
    const dn = u.displayName.trim().toLowerCase();
    const un = u.username.trim().toLowerCase();
    if (dn) map[dn] = u.avatarUrl;
    if (un && !map[un]) map[un] = u.avatarUrl;
  }
  return map;
}

/**
 * Resolves a player's avatar URL:
 * 1) Explicit player.avatarUrl
 * 2) Synced UserAccount avatar matching player's name
 * 3) Deterministic curated club sports emblem preset (FNV-1a mixed hash for high diversity)
 */
export function resolvePlayerAvatar(
  name: string,
  explicitUrl?: string,
  avatarsByName?: Record<string, string>,
  fallbackToPreset = true
): string | undefined {
  if (explicitUrl) return explicitUrl;
  const key = name.trim().toLowerCase();
  if (key && avatarsByName?.[key]) return avatarsByName[key];
  if (!fallbackToPreset) return undefined;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return PRESET_AVATARS[(hash >>> 0) % PRESET_AVATARS.length]?.dataUrl;
}

