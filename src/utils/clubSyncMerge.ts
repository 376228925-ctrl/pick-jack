export interface UserSyncLike {
  id: string;
  username?: string;
  displayName?: string;
  dupr?: number;
  role?: string;
  avatarUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface MatchSyncLike {
  id: string;
  status?: string;
  scoreA?: number | null;
  scoreB?: number | null;
  completedAt?: number;
}

export interface RoundSyncLike {
  roundNumber: number;
  matches?: MatchSyncLike[];
}

export interface SessionSyncLike {
  id: string;
  updatedAt?: number;
  sessionDate?: string;
  players?: unknown[];
  rounds?: RoundSyncLike[];
}

function getUserTimestamp(u: UserSyncLike): number {
  return u.updatedAt ?? u.createdAt ?? 0;
}

function mergeTwoUsers<T extends UserSyncLike>(prev: T, inc: T): T {
  const prevTs = getUserTimestamp(prev);
  const incTs = getUserTimestamp(inc);
  const newer = incTs >= prevTs ? inc : prev;
  const older = incTs >= prevTs ? prev : inc;

  // Never accidentally downgrade super_admin via a stale payload
  const role =
    prev.role === 'super_admin' || inc.role === 'super_admin'
      ? 'super_admin'
      : newer.role ?? older.role;

  return {
    ...older,
    ...newer,
    id: prev.id || inc.id,
    role,
    avatarUrl: newer.avatarUrl || older.avatarUrl,
    createdAt:
      prev.createdAt && inc.createdAt
        ? Math.min(prev.createdAt, inc.createdAt)
        : prev.createdAt ?? inc.createdAt,
    updatedAt: Math.max(prevTs, incTs) || undefined,
  };
}

/**
 * Conflict-safe user list merge for multi-device registration & admin permission changes:
 * - Never loses a newly registered user from either side (existing cloud or incoming phone).
 * - Deduplicates by both `id` and case-insensitive `username`.
 * - Resolves edits (profile, avatar, admin role promotion) by newest `updatedAt` timestamp.
 */
export function mergeClubUsers<T extends UserSyncLike>(existing: T[], incoming: T[]): T[] {
  const merged: T[] = [];
  const indexById = new Map<string, number>();
  const indexByUsername = new Map<string, number>();

  const upsert = (user: T) => {
    if (!user || !user.id) return;
    const unameKey = typeof user.username === 'string' ? user.username.trim().toLowerCase() : '';
    const existingIdx =
      indexById.get(user.id) ?? (unameKey ? indexByUsername.get(unameKey) : undefined);

    if (existingIdx === undefined) {
      const nextIdx = merged.length;
      merged.push(user);
      indexById.set(user.id, nextIdx);
      if (unameKey) indexByUsername.set(unameKey, nextIdx);
    } else {
      const combined = mergeTwoUsers(merged[existingIdx], user);
      merged[existingIdx] = combined;
      indexById.set(combined.id, existingIdx);
      if (user.id !== combined.id) indexById.set(user.id, existingIdx);
      if (unameKey) indexByUsername.set(unameKey, existingIdx);
    }
  };

  for (const u of existing) upsert(u);
  for (const u of incoming) upsert(u);

  return merged;
}

/**
 * Conflict-safe session merge: preserves scores entered simultaneously on different courts
 * across multiple phones by merging match completions per match ID.
 */
export function mergeClubSessions<T extends SessionSyncLike>(existing: T[], incoming: T[]): T[] {
  const byId = new Map<string, T>();
  for (const s of existing) {
    if (s && s.id) byId.set(s.id, s);
  }

  for (const inc of incoming) {
    if (!inc || !inc.id) continue;
    const prev = byId.get(inc.id);
    if (!prev) {
      byId.set(inc.id, inc);
      continue;
    }

    const incNewer = (inc.updatedAt ?? 0) >= (prev.updatedAt ?? 0);
    const base = incNewer ? inc : prev;
    const other = incNewer ? prev : inc;

    const otherMatches = new Map<string, MatchSyncLike>();
    for (const r of other.rounds ?? []) {
      for (const m of r.matches ?? []) {
        if (m && m.id) otherMatches.set(m.id, m);
      }
    }

    const mergedRounds = (base.rounds ?? []).map((r) => ({
      ...r,
      matches: (r.matches ?? []).map((m) => {
        const om = otherMatches.get(m.id);
        if (!om) return m;
        // If base match is pending but other phone already scored it, preserve the scored result
        if (m.status !== 'completed' && om.status === 'completed') {
          return om;
        }
        // If both completed, keep whichever has the newer completedAt timestamp
        if (
          m.status === 'completed' &&
          om.status === 'completed' &&
          (om.completedAt ?? 0) > (m.completedAt ?? 0)
        ) {
          return om;
        }
        return m;
      }),
    }));

    byId.set(inc.id, {
      ...base,
      rounds: mergedRounds,
      updatedAt: Math.max(prev.updatedAt ?? 0, inc.updatedAt ?? 0),
    });
  }

  return Array.from(byId.values()).sort((a, b) =>
    (b.sessionDate || '').localeCompare(a.sessionDate || '')
  );
}

/**
 * Computes a deterministic lightweight fingerprint of users & sessions so the client
 * only pushes PUT /api/club-data when meaningful local mutations occurred (no infinite sync loops).
 */
export function computeClubSyncSignature(
  users: UserSyncLike[],
  sessions: SessionSyncLike[]
): string {
  const userSig = [...users]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((u) => {
      const avLen = typeof u.avatarUrl === 'string' ? u.avatarUrl.length : 0;
      return `${u.id}|${u.username ?? ''}|${u.role ?? ''}|${String(u.displayName ?? '')}|${String(u.dupr ?? '')}|${u.updatedAt ?? u.createdAt ?? 0}|${avLen}`;
    })
    .join(';');

  const sessionSig = [...sessions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => {
      const matchSig = (s.rounds ?? [])
        .map((r) =>
          (r.matches ?? [])
            .map((m) => `${m.id}:${m.status ?? ''}:${m.scoreA ?? ''}-${m.scoreB ?? ''}:${m.completedAt ?? 0}`)
            .join(',')
        )
        .join('/');
      const pCount = Array.isArray(s.players) ? s.players.length : 0;
      return `${s.id}|${s.updatedAt ?? 0}|${pCount}|${matchSig}`;
    })
    .join(';');

  return `${userSig}##${sessionSig}`;
}
