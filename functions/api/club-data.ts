import {
  mergeClubSessions,
  mergeClubUsers,
  type SessionSyncLike,
  type UserSyncLike,
} from '../../src/utils/clubSyncMerge';

interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  TOURNAMENT_KV?: KVNamespaceLike;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const CLUB_KEY = 'club:shared_state_v1';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

/**
 * Cloudflare Pages Function: GET & PUT /api/club-data
 * Default-on multi-user cloud database backed by Cloudflare KV (TOURNAMENT_KV).
 */
export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const kv = context.env.TOURNAMENT_KV;
  if (!kv) {
    return jsonResponse({ ok: false, storageMode: 'local_only', error: '尚未绑定 TOURNAMENT_KV' }, 503);
  }

  try {
    const raw = await kv.get(CLUB_KEY);
    if (!raw) {
      return jsonResponse({ ok: true, empty: true, storageMode: 'cloudflare_kv' }, 200);
    }
    const parsed = JSON.parse(raw) as {
      users?: UserSyncLike[];
      sessions?: SessionSyncLike[];
      updatedAt?: number;
    };
    return jsonResponse({
      ok: true,
      empty: false,
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? [],
      updatedAt: parsed.updatedAt ?? Date.now(),
      storageMode: 'cloudflare_kv',
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : '云端俱乐部数据读取失败' },
      500
    );
  }
};

export const onRequestPut = async (context: PagesContext): Promise<Response> => {
  const kv = context.env.TOURNAMENT_KV;
  if (!kv) {
    return jsonResponse({ ok: false, storageMode: 'local_only', error: '尚未绑定 TOURNAMENT_KV' }, 503);
  }

  try {
    const body = (await context.request.json()) as {
      users?: UserSyncLike[];
      sessions?: SessionSyncLike[];
    };
    if (!Array.isArray(body.users) && !Array.isArray(body.sessions)) {
      return jsonResponse({ ok: false, error: '无效的俱乐部数据格式' }, 400);
    }

    const existingRaw = await kv.get(CLUB_KEY);
    const existing = existingRaw
      ? (JSON.parse(existingRaw) as { users?: UserSyncLike[]; sessions?: SessionSyncLike[] })
      : {};

    const updatedAt = Date.now();
    const nextRecord = {
      users: Array.isArray(body.users)
        ? mergeClubUsers(existing.users ?? [], body.users)
        : existing.users ?? [],
      sessions: Array.isArray(body.sessions)
        ? mergeClubSessions(existing.sessions ?? [], body.sessions)
        : existing.sessions ?? [],
      updatedAt,
    };

    await kv.put(CLUB_KEY, JSON.stringify(nextRecord));
    return jsonResponse({
      ok: true,
      updatedAt,
      users: nextRecord.users,
      sessions: nextRecord.sessions,
      storageMode: 'cloudflare_kv',
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, error: err instanceof Error ? err.message : '云端俱乐部数据保存失败' },
      500
    );
  }
};
