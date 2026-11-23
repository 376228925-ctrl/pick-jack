import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiMatchmakeSheet } from './components/AiMatchmakeSheet';
import { BottomNav } from './components/BottomNav';
import { CloudSyncSheet } from './components/CloudSyncSheet';
import { MatchPreviewSheet } from './components/MatchPreviewSheet';
import { PlayersView } from './components/PlayersView';
import { ProfileView } from './components/ProfileView';
import { ScheduleView } from './components/ScheduleView';
import { ScoreSheet } from './components/ScoreSheet';
import { SetupView } from './components/SetupView';
import { StandingsView } from './components/StandingsView';
import { ThemeSwitcherModal } from './components/ThemeSwitcherModal';
import { TopNav } from './components/TopNav';
import { WeChatReportModal } from './components/WeChatReportModal';
import type {
  AppTab,
  Gender,
  Match,
  ParsedPlayerInput,
  Player,
  Round,
  TournamentConfig,
  TournamentState,
  UserAccount,
} from './types/tournament';
import type { AiMatchmakeResult } from './utils/aiAnalysis';
import {
  authenticateUser,
  loadActiveUserId,
  loadUsers,
  registerNewAccount,
  saveActiveUserId,
  saveUsers,
  updateUserRoleByAdmin,
} from './utils/authStore';
import { buildAvatarLookup } from './utils/avatarUtils';
import {
  computeClubSyncSignature,
  mergeClubSessions,
  mergeClubUsers,
} from './utils/clubSyncMerge';
import {
  loadCareerMemory,
  recordCompletedMatchesToMemory,
  saveCareerMemory,
  type CareerMemoryMap,
} from './utils/playerMemory';
import {
  isValidRoomCode,
  normalizeRoomCode,
  pullRoomState,
  validateTournamentStatePayload,
} from './utils/roomSync';
import {
  analyzeScheduleFairness,
  calculateStandings,
  generateNextMexicanoRound,
  generateSmartSchedule,
  getRecommendedRounds,
  rescheduleRemainingRounds,
  swapPlayersInRound,
} from './utils/scheduler';
import {
  createInitialCalendarSessions,
  createSessionForDate,
  loadCalendarSessions,
  saveCalendarSessions,
} from './utils/sessionArchive';
import {
  getThemeConfig,
  loadSavedTheme,
  saveTheme,
  type ScenicThemeId,
} from './utils/themes';

function findDefaultActiveRound(state: TournamentState): number {
  const firstPending = state.rounds.find((r) =>
    r.matches.some((m) => m.status !== 'completed')
  );
  return firstPending?.roundNumber ?? state.rounds[state.rounds.length - 1]?.roundNumber ?? 1;
}

export default function App() {
  // Multi-day calendar sessions store
  const [sessions, setSessions] = useState<TournamentState[]>(() => loadCalendarSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const initial = loadCalendarSessions();
    return initial[0]?.id ?? '';
  });

  // Active scenic background photography & tone theme
  const [activeTheme, setActiveTheme] = useState<ScenicThemeId>(() => loadSavedTheme());
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  // Accounts & RBAC (Jack Super Admin + Admins + Isolated Members)
  const [users, setUsers] = useState<UserAccount[]>(() => loadUsers());
  const [activeUserId, setActiveUserId] = useState<string | null>(() => loadActiveUserId());

  const [activeTab, setActiveTab] = useState<AppTab>('schedule');
  const [activeRoundNumber, setActiveRoundNumber] = useState<number>(() => {
    const first = loadCalendarSessions()[0];
    return first ? findDefaultActiveRound(first) : 1;
  });

  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [previewMatchId, setPreviewMatchId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [posterSpotlightPlayerId, setPosterSpotlightPlayerId] = useState<string | null>(null);
  const [cloudSyncOpen, setCloudSyncOpen] = useState(false);
  const [aiMatchmakeOpen, setAiMatchmakeOpen] = useState(false);
  const [careerMemory, setCareerMemory] = useState<CareerMemoryMap>(() => loadCareerMemory());
  const [roomCode, setRoomCode] = useState<string | null>(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('room');
      const normalized = param ? normalizeRoomCode(param) : '';
      return isValidRoomCode(normalized) ? normalized : null;
    } catch {
      return null;
    }
  });
  const [toast, setToast] = useState<string | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'idle' | 'syncing' | 'synced' | 'local_only'
  >('idle');
  const [cloudHydrated, setCloudHydrated] = useState(false);

  const avatarsByName = useMemo(() => buildAvatarLookup(users), [users]);

  const state: TournamentState = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  );

  const currentUser: UserAccount | null = useMemo(
    () => (activeUserId ? users.find((u) => u.id === activeUserId) ?? null : null),
    [users, activeUserId]
  );

  const themeCfg = getThemeConfig(activeTheme);

  const updateCurrentSession = useCallback(
    (updater: (prev: TournamentState) => TournamentState) => {
      setSessions((prevList) =>
        prevList.map((s) => (s.id === activeSessionId ? updater(s) : s))
      );
    },
    [activeSessionId]
  );

  // Persist sessions & sync career memory across ALL sessions
  useEffect(() => {
    saveCalendarSessions(sessions);
    setCareerMemory((prev) => {
      let next = prev;
      for (const s of sessions) {
        next = recordCompletedMatchesToMemory(next, s.id, s.players, s.rounds);
      }
      saveCareerMemory(next);
      return next;
    });
  }, [sessions]);

  // Persist users & active session user
  useEffect(() => {
    saveUsers(users);
  }, [users]);

  useEffect(() => {
    saveActiveUserId(activeUserId);
  }, [activeUserId]);

  // Persist scenic theme and apply data-theme attribute to documentElement
  useEffect(() => {
    saveTheme(activeTheme);
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, [activeTheme]);

  const usersRef = useRef<UserAccount[]>(users);
  const sessionsRef = useRef<TournamentState[]>(sessions);
  const lastSyncedSigRef = useRef<string>('');
  const kvUnavailableRef = useRef<boolean>(false);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const applyMergedClubState = useCallback(
    (cloudUsers?: UserAccount[], cloudSessions?: TournamentState[]) => {
      const nextUsers =
        Array.isArray(cloudUsers) && cloudUsers.length > 0
          ? mergeClubUsers(usersRef.current, cloudUsers)
          : usersRef.current;
      const nextSessions =
        Array.isArray(cloudSessions) && cloudSessions.length > 0
          ? mergeClubSessions(sessionsRef.current, cloudSessions)
          : sessionsRef.current;

      const nextSig = computeClubSyncSignature(nextUsers, nextSessions);
      lastSyncedSigRef.current = nextSig;

      if (computeClubSyncSignature(usersRef.current, []) !== computeClubSyncSignature(nextUsers, [])) {
        usersRef.current = nextUsers;
        setUsers(nextUsers);
      }
      if (
        computeClubSyncSignature([], sessionsRef.current) !==
        computeClubSyncSignature([], nextSessions)
      ) {
        sessionsRef.current = nextSessions;
        setSessions(nextSessions);
      }
      return { users: nextUsers, sessions: nextSessions };
    },
    []
  );

  // Immediately push club users & sessions to cloud (/api/club-data) with server-side conflict-safe merge
  const pushClubToCloud = useCallback(
    async (
      nextUsers: UserAccount[],
      nextSessions: TournamentState[]
    ): Promise<{ ok: boolean; storageMode?: string }> => {
      if (kvUnavailableRef.current) {
        return { ok: false, storageMode: 'local_only' };
      }
      try {
        const res = await fetch('/api/club-data', {
          method: 'PUT',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users: nextUsers, sessions: nextSessions }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          storageMode?: string;
          users?: UserAccount[];
          sessions?: TournamentState[];
        };
        if (res.status === 503 && data.storageMode === 'local_only') {
          kvUnavailableRef.current = true;
          setCloudSyncStatus('local_only');
          return { ok: false, storageMode: 'local_only' };
        }
        if (!res.ok || !data.ok) {
          return { ok: false };
        }
        applyMergedClubState(data.users ?? nextUsers, data.sessions ?? nextSessions);
        setCloudSyncStatus('synced');
        return { ok: true, storageMode: data.storageMode };
      } catch {
        return { ok: false };
      }
    },
    [applyMergedClubState]
  );

  // Pull shared club accounts, avatars & calendar sessions from cloud (/api/club-data) with no-cache busting
  const syncClubFromCloud = useCallback(
    async (silent = false): Promise<UserAccount[]> => {
      if (!silent) {
        setCloudSyncStatus('syncing');
      }
      try {
        const res = await fetch(`/api/club-data?_t=${Date.now()}`, {
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          empty?: boolean;
          storageMode?: string;
          users?: UserAccount[];
          sessions?: TournamentState[];
        };

        if (res.status === 503 && data.storageMode === 'local_only') {
          kvUnavailableRef.current = true;
          setCloudSyncStatus('local_only');
          setCloudHydrated(true);
          if (!silent) {
            setToast('云端 KV 尚未绑定，当前仅保存在本机浏览器');
          }
          return usersRef.current;
        }

        if (!res.ok || !data.ok) {
          setCloudHydrated(true);
          if (!silent) {
            setToast('云端暂时连接波动，稍后将自动重试同步');
          }
          return usersRef.current;
        }

        kvUnavailableRef.current = false;

        if (data.empty) {
          // First-time cloud initialization: seed cloud immediately with current local state
          await pushClubToCloud(usersRef.current, sessionsRef.current);
          setCloudSyncStatus('synced');
          if (!silent) {
            setToast('已初始化云端俱乐部数据库并完成同步');
          }
          return usersRef.current;
        }

        const merged = applyMergedClubState(data.users, data.sessions);
        // If local phone had newer/extra registrations that cloud didn't have yet, push them right back
        const cloudOnlySig = computeClubSyncSignature(data.users ?? [], data.sessions ?? []);
        const mergedSig = computeClubSyncSignature(merged.users, merged.sessions);
        if (cloudOnlySig !== mergedSig) {
          void pushClubToCloud(merged.users, merged.sessions);
        }

        setCloudSyncStatus('synced');
        if (!silent) {
          setToast(`已同步云端最新数据（共 ${merged.users.length} 位注册球友）`);
        }
        return merged.users;
      } catch {
        if (!silent) {
          setToast('网络波动，暂未拉取到最新云端数据');
        }
        return usersRef.current;
      } finally {
        setCloudHydrated(true);
      }
    },
    [applyMergedClubState, pushClubToCloud]
  );

  useEffect(() => {
    void syncClubFromCloud(true);
  }, [syncClubFromCloud]);

  // Automatic 8-second live multi-phone polling + immediate pull when tab returns to foreground
  useEffect(() => {
    if (!cloudHydrated) return;
    const pollId = window.setInterval(() => {
      if (kvUnavailableRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void syncClubFromCloud(true);
    }, 8000);

    const handleVisibilityOrFocus = () => {
      if (kvUnavailableRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void syncClubFromCloud(true);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [cloudHydrated, syncClubFromCloud]);

  // Auto-push updated club accounts/avatars & calendar sessions ONLY when local data actually changed
  useEffect(() => {
    if (!cloudHydrated || kvUnavailableRef.current) return;
    const currentSig = computeClubSyncSignature(users, sessions);
    if (currentSig === lastSyncedSigRef.current) return;

    const timer = window.setTimeout(() => {
      void pushClubToCloud(users, sessions);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [users, sessions, cloudHydrated, pushClubToCloud]);

  // Listen for WeChat OAuth2 callback (popup postMessage or redirect sessionStorage)
  useEffect(() => {
    const applyWeChatProfile = (profile: {
      openid: string;
      nickname: string;
      avatarUrl?: string;
      gender?: Gender;
    }) => {
      if (activeUserId) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === activeUserId
              ? {
                  ...u,
                  displayName: profile.nickname || u.displayName,
                  avatarUrl: profile.avatarUrl || u.avatarUrl,
                  gender: profile.gender || u.gender,
                }
              : u
          )
        );
        setToast(`已同步微信头像与昵称：${profile.nickname}`);
      } else {
        const wxUsername = `wx_${profile.openid.slice(-8)}`;
        setUsers((prev) => {
          const existing = prev.find((u) => u.username === wxUsername);
          if (existing) {
            setActiveUserId(existing.id);
            return prev.map((u) =>
              u.id === existing.id
                ? {
                    ...u,
                    displayName: profile.nickname || u.displayName,
                    avatarUrl: profile.avatarUrl || u.avatarUrl,
                  }
                : u
            );
          }
          const created: UserAccount = {
            id: `u-wx-${profile.openid.slice(-10)}`,
            username: wxUsername,
            passwordHash: '',
            role: 'member',
            displayName: profile.nickname || '微信球友',
            avatarUrl: profile.avatarUrl,
            gender: profile.gender || 'U',
            dupr: 3.5,
            handedness: 'right',
            playStyle: '均衡全能型',
            bio: '微信一键授权认证球友',
            createdAt: Date.now(),
          };
          setActiveUserId(created.id);
          return [...prev, created];
        });
        setToast(`微信登录成功，欢迎 ${profile.nickname}`);
      }
    };

    try {
      const pending = window.sessionStorage.getItem('qingzhuan_wechat_pending');
      if (pending) {
        window.sessionStorage.removeItem('qingzhuan_wechat_pending');
        const parsed = JSON.parse(pending) as {
          type?: string;
          profile?: { openid: string; nickname: string; avatarUrl?: string; gender?: Gender };
        };
        if (parsed.type === 'WECHAT_AUTH_SUCCESS' && parsed.profile) {
          applyWeChatProfile(parsed.profile);
        }
      }
    } catch {
      // Ignore storage error
    }

    const onMsg = (event: MessageEvent) => {
      if (event.data?.type === 'WECHAT_AUTH_SUCCESS' && event.data?.profile) {
        applyWeChatProfile(event.data.profile);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [activeUserId]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  // If opened with ?room=CODE, automatically pull the live cloud room snapshot
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    pullRoomState(roomCode)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.state) {
          const validated = validateTournamentStatePayload(res.state);
          if (validated) {
            setSessions((prev) => {
              const exists = prev.some((s) => s.id === validated.id);
              return exists
                ? prev.map((s) => (s.id === validated.id ? validated : s))
                : [validated, ...prev];
            });
            setActiveSessionId(validated.id);
            setActiveRoundNumber(findDefaultActiveRound(validated));
            showToast(`已同步云端房间 ${roomCode} 的最新赛况`);
          }
        }
      })
      .catch(() => {
        // Silent fallback to local sessions
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const standings = useMemo(
    () => calculateStandings(state.players, state.rounds),
    [state.players, state.rounds]
  );

  const fairness = useMemo(
    () => analyzeScheduleFairness(state.players, state.rounds),
    [state.players, state.rounds]
  );

  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    state.players.forEach((p) => map.set(p.id, p));
    return map;
  }, [state.players]);

  const playedCountByPlayer = useMemo(() => {
    const map = new Map<string, number>();
    standings.forEach((s) => map.set(s.player.id, s.played));
    return map;
  }, [standings]);

  const totalMatches = useMemo(
    () => state.rounds.reduce((sum, r) => sum + r.matches.length, 0),
    [state.rounds]
  );

  const completedMatches = useMemo(
    () =>
      state.rounds.reduce(
        (sum, r) => sum + r.matches.filter((m) => m.status === 'completed').length,
        0
      ),
    [state.rounds]
  );

  const scoringMatch: Match | null = useMemo(() => {
    if (!scoringMatchId) return null;
    for (const round of state.rounds) {
      const found = round.matches.find((m) => m.id === scoringMatchId);
      if (found) return found;
    }
    return null;
  }, [scoringMatchId, state.rounds]);

  const previewMatch: Match | null = useMemo(() => {
    if (!previewMatchId) return null;
    for (const round of state.rounds) {
      const found = round.matches.find((m) => m.id === previewMatchId);
      if (found) return found;
    }
    return null;
  }, [previewMatchId, state.rounds]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target) return;
      setActiveSessionId(sessionId);
      setActiveRoundNumber(findDefaultActiveRound(target));
      showToast(`已切换至 ${target.sessionDate || ''} · ${target.config.title}`);
    },
    [sessions, showToast]
  );

  const handleCreateSession = useCallback(
    (params: {
      sessionDate: string;
      config: TournamentConfig;
      rosterMode: 'reuse' | 'fresh';
    }) => {
      const freshSession = createSessionForDate({
        sessionDate: params.sessionDate,
        config: params.config,
        players: params.rosterMode === 'reuse' ? state.players : [],
        publishedBy: currentUser?.displayName || '管理员',
      });
      if (params.rosterMode === 'fresh') {
        freshSession.players = [];
        freshSession.rounds = [];
      }
      setSessions((prev) => [freshSession, ...prev]);
      setActiveSessionId(freshSession.id);
      setActiveRoundNumber(1);
      if (params.rosterMode === 'fresh') {
        setActiveTab('players');
        showToast(`已发布 ${params.sessionDate} 新赛局，请粘贴今日接龙导入球友`);
      } else {
        setActiveTab('schedule');
        showToast(`已发布 ${params.sessionDate} 新赛局（历史记录完整保留）`);
      }
    },
    [state.players, currentUser, showToast]
  );

  const handleSaveScore = useCallback(
    (matchId: string, scoreA: number, scoreB: number) => {
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        rounds: prev.rounds.map((round) => ({
          ...round,
          matches: round.matches.map((m) =>
            m.id === matchId
              ? {
                  ...m,
                  scoreA,
                  scoreB,
                  status: 'completed',
                  completedAt: Date.now(),
                }
              : m
          ),
        })),
      }));
      showToast(`比分已记录：${scoreA} : ${scoreB}`);
    },
    [updateCurrentSession, showToast]
  );

  const handleClearScore = useCallback(
    (matchId: string) => {
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        rounds: prev.rounds.map((round) => ({
          ...round,
          matches: round.matches.map((m) =>
            m.id === matchId
              ? {
                  ...m,
                  scoreA: null,
                  scoreB: null,
                  status: 'pending',
                  completedAt: undefined,
                }
              : m
          ),
        })),
      }));
      showToast('已清除该场比分');
    },
    [updateCurrentSession, showToast]
  );

  const handleSwapPlayers = useCallback(
    (roundNumber: number, playerIdA: string, playerIdB: string) => {
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        rounds: prev.rounds.map((round) =>
          round.roundNumber === roundNumber
            ? swapPlayersInRound(round, playerIdA, playerIdB)
            : round
        ),
      }));
      const nameA = playerMap.get(playerIdA)?.name ?? '';
      const nameB = playerMap.get(playerIdB)?.name ?? '';
      showToast(`已互换 ${nameA} 与 ${nameB} 的站位`);
    },
    [updateCurrentSession, playerMap, showToast]
  );

  const handleGenerateNextMexicano = useCallback(() => {
    updateCurrentSession((prev) => {
      const nextRound = generateNextMexicanoRound(
        prev.players,
        prev.rounds,
        prev.config,
        prev.seed
      );
      setActiveRoundNumber(nextRound.roundNumber);
      return {
        ...prev,
        updatedAt: Date.now(),
        rosterDirty: false,
        rounds: [...prev.rounds, nextRound],
      };
    });
    showToast('已按实时积分生成下一轮升场对阵');
  }, [updateCurrentSession, showToast]);

  const handleRescheduleRemaining = useCallback(() => {
    updateCurrentSession((prev) => {
      const next = rescheduleRemainingRounds(prev);
      setActiveRoundNumber(findDefaultActiveRound(next));
      return next;
    });
    showToast('已保留完赛记录并智能重排后续轮次');
  }, [updateCurrentSession, showToast]);

  const handleAddPlayer = useCallback(
    (input: ParsedPlayerInput) => {
      updateCurrentSession((prev) => {
        const nextRoundJoined =
          prev.rounds.filter((r) => r.matches.some((m) => m.status === 'completed')).length + 1;
        const newPlayer: Player = {
          id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: input.name,
          gender: input.gender,
          rating: input.rating,
          active: true,
          joinedRound: nextRoundJoined,
        };
        return {
          ...prev,
          updatedAt: Date.now(),
          players: [...prev.players, newPlayer],
          rosterDirty: true,
        };
      });
      showToast(`已加入球友「${input.name}」，可点击智能重排生效`);
    },
    [updateCurrentSession, showToast]
  );

  const handleImportPlayers = useCallback(
    (inputs: ParsedPlayerInput[], mode: 'append' | 'replace') => {
      if (inputs.length === 0) return;

      if (mode === 'replace') {
        const newPlayers: Player[] = inputs.map((item, idx) => ({
          id: `imp-${Date.now()}-${idx}`,
          name: item.name,
          gender: item.gender,
          rating: item.rating,
          active: true,
          joinedRound: 1,
        }));

        updateCurrentSession((prev) => {
          const maxCourts = Math.max(
            1,
            Math.min(prev.config.courtCount, Math.floor(newPlayers.length / 4) || 1)
          );
          const recommended = getRecommendedRounds(newPlayers.length, maxCourts);
          const nextConfig: TournamentConfig = {
            ...prev.config,
            courtCount: maxCourts,
            totalRounds: recommended,
          };
          const nextSeed = prev.seed + 13;
          const nextRounds = generateSmartSchedule(newPlayers, nextConfig, nextSeed);
          setActiveRoundNumber(1);
          return {
            ...prev,
            seed: nextSeed,
            updatedAt: Date.now(),
            config: nextConfig,
            players: newPlayers,
            rounds: nextRounds,
            rosterDirty: false,
          };
        });
        showToast(`已导入 ${inputs.length} 位球友并重新生成赛程`);
        return;
      }

      updateCurrentSession((prev) => {
        const existingNames = new Set(prev.players.map((p) => p.name.toLowerCase()));
        const nextRoundJoined =
          prev.rounds.filter((r) => r.matches.some((m) => m.status === 'completed')).length + 1;
        const additions: Player[] = inputs
          .filter((item) => !existingNames.has(item.name.toLowerCase()))
          .map((item, idx) => ({
            id: `imp-${Date.now()}-${idx}`,
            name: item.name,
            gender: item.gender,
            rating: item.rating,
            active: true,
            joinedRound: nextRoundJoined,
          }));

        if (additions.length === 0) {
          showToast('导入名单中的球友均已在当前名单中');
          return prev;
        }

        showToast(`已追加 ${additions.length} 位球友，可点击智能重排生效`);
        return {
          ...prev,
          updatedAt: Date.now(),
          players: [...prev.players, ...additions],
          rosterDirty: true,
        };
      });
    },
    [updateCurrentSession, showToast]
  );

  const handleToggleActive = useCallback(
    (playerId: string) => {
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        rosterDirty: true,
        players: prev.players.map((p) =>
          p.id === playerId ? { ...p, active: !p.active } : p
        ),
      }));
    },
    [updateCurrentSession]
  );

  const handleUpdateRating = useCallback(
    (playerId: string, nextRating: number) => {
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        players: prev.players.map((p) =>
          p.id === playerId ? { ...p, rating: nextRating } : p
        ),
      }));
    },
    [updateCurrentSession]
  );

  const handleUpdateGender = useCallback(
    (playerId: string, gender: Gender) => {
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        players: prev.players.map((p) => (p.id === playerId ? { ...p, gender } : p)),
      }));
    },
    [updateCurrentSession]
  );

  const handleRemovePlayer = useCallback(
    (playerId: string) => {
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        rosterDirty: true,
        players: prev.players.filter((p) => p.id !== playerId),
      }));
      showToast('已移除球友');
    },
    [updateCurrentSession, showToast]
  );

  const handleApplyConfigAndGenerate = useCallback(
    (nextConfig: TournamentConfig) => {
      updateCurrentSession((prev) => {
        const nextSeed = prev.seed + 29;
        const nextRounds = generateSmartSchedule(prev.players, nextConfig, nextSeed);
        return {
          ...prev,
          seed: nextSeed,
          publishedBy: currentUser?.displayName || prev.publishedBy,
          updatedAt: Date.now(),
          config: nextConfig,
          rounds: nextRounds,
          rosterDirty: false,
        };
      });
      setActiveRoundNumber(1);
      setActiveTab('schedule');
      showToast('已发布新赛制并生成智能赛程');
    },
    [updateCurrentSession, currentUser, showToast]
  );

  const handleShuffleSchedule = useCallback(() => {
    updateCurrentSession((prev) => rescheduleRemainingRounds(prev));
    setActiveTab('schedule');
    showToast('已为你换一套高公平度排阵方案');
  }, [updateCurrentSession, showToast]);

  const handleResetDemo = useCallback(() => {
    const freshList = createInitialCalendarSessions();
    setSessions(freshList);
    setActiveSessionId(freshList[0].id);
    setActiveRoundNumber(findDefaultActiveRound(freshList[0]));
    setActiveTab('schedule');
    showToast('已恢复今日与昨日默认示例赛事');
  }, [showToast]);

  const handleApplyImportedState = useCallback(
    (nextState: TournamentState, sourceLabel: string) => {
      setSessions((prev) => {
        const exists = prev.some((s) => s.id === nextState.id);
        return exists
          ? prev.map((s) => (s.id === nextState.id ? nextState : s))
          : [nextState, ...prev];
      });
      setActiveSessionId(nextState.id);
      setActiveRoundNumber(findDefaultActiveRound(nextState));
      showToast(sourceLabel);
    },
    [showToast]
  );

  const handleApplyAiPlan = useCallback(
    (targetRoundNumber: number, mode: 'replace' | 'append', plan: AiMatchmakeResult) => {
      const newRound: Round = {
        roundNumber: targetRoundNumber,
        restingPlayerIds: plan.restingIds,
        generatedMode: 'ai_smart',
        matches: plan.courts.map((c) => ({
          id: `r${targetRoundNumber}-c${c.courtNumber}-ai-${Date.now().toString(36)}`,
          roundNumber: targetRoundNumber,
          courtNumber: c.courtNumber,
          teamA: c.teamA,
          teamB: c.teamB,
          scoreA: null,
          scoreB: null,
          status: 'pending',
          aiReason: c.storyline,
        })),
      };

      updateCurrentSession((prev) => {
        if (mode === 'append') {
          return {
            ...prev,
            updatedAt: Date.now(),
            config: {
              ...prev.config,
              totalRounds: Math.max(prev.config.totalRounds, targetRoundNumber),
            },
            rounds: [...prev.rounds, newRound],
          };
        }

        const exists = prev.rounds.some((r) => r.roundNumber === targetRoundNumber);
        return {
          ...prev,
          updatedAt: Date.now(),
          rounds: exists
            ? prev.rounds.map((r) => (r.roundNumber === targetRoundNumber ? newRound : r))
            : [...prev.rounds, newRound],
        };
      });

      setActiveRoundNumber(targetRoundNumber);
      showToast(`已应用 DeepSeek 智排方案至第 ${targetRoundNumber} 轮`);
    },
    [updateCurrentSession, showToast]
  );

  const handleApplyCalibratedRatings = useCallback(
    (updates: Array<{ playerId: string; rating: number }>) => {
      const ratingMap = new Map(updates.map((u) => [u.playerId, u.rating]));
      updateCurrentSession((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        rosterDirty: true,
        players: prev.players.map((p) =>
          ratingMap.has(p.id) ? { ...p, rating: ratingMap.get(p.id)! } : p
        ),
      }));
      showToast(`已更新 ${updates.length} 位球友的实打 DUPR 评分`);
    },
    [updateCurrentSession, showToast]
  );

  // Auth & RBAC handlers (with immediate cloud persistence & cross-device lookup)
  const handleLogin = useCallback(
    async (username: string, password: string) => {
      let res = authenticateUser(usersRef.current, username, password);
      if (!res.ok) {
        // Pull fresh cloud accounts once in case the user just registered on another phone
        const freshUsers = await syncClubFromCloud(true);
        res = authenticateUser(freshUsers, username, password);
      }
      if (!res.ok) return res;
      setActiveUserId(res.user.id);
      showToast(`欢迎回来，${res.user.displayName}`);
      return { ok: true };
    },
    [syncClubFromCloud, showToast]
  );

  const handleRegister = useCallback(
    (input: {
      username: string;
      password: string;
      displayName: string;
      gender: Gender;
      dupr: number;
    }) => {
      const res = registerNewAccount(usersRef.current, input);
      if (!res.ok) return res;
      usersRef.current = res.nextUsers;
      setUsers(res.nextUsers);
      setActiveUserId(res.user.id);
      showToast(`已创建球手档案：${res.user.displayName}，正在同步上云…`);
      void pushClubToCloud(res.nextUsers, sessionsRef.current).then((pushed) => {
        if (pushed.ok) {
          showToast(`球手「${res.user.displayName}」已成功同步至云端数据库`);
        } else if (pushed.storageMode === 'local_only') {
          showToast(`已创建本地档案：${res.user.displayName}（当前环境未绑定云端 KV）`);
        }
      });
      return { ok: true };
    },
    [pushClubToCloud, showToast]
  );

  const handleLogout = useCallback(() => {
    setActiveUserId(null);
    showToast('已退出登录');
  }, [showToast]);

  const handleUpdateProfile = useCallback(
    (patch: {
      displayName?: string;
      avatarUrl?: string;
      gender?: Gender;
      dupr?: number;
      handedness?: 'right' | 'left';
      playStyle?: string;
      bio?: string;
    }) => {
      if (!activeUserId) return;
      const now = Date.now();
      const nextUsers = usersRef.current.map((u) =>
        u.id === activeUserId ? { ...u, ...patch, updatedAt: now } : u
      );
      usersRef.current = nextUsers;
      setUsers(nextUsers);
      void pushClubToCloud(nextUsers, sessionsRef.current);
      showToast(patch.avatarUrl ? '个人头像已更新并同步上云' : '个人档案已更新并同步上云');
    },
    [activeUserId, pushClubToCloud, showToast]
  );

  const handleToggleUserAdmin = useCallback(
    (targetUserId: string, nextRole: 'admin' | 'member') => {
      const res = updateUserRoleByAdmin(usersRef.current, currentUser, targetUserId, nextRole);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      usersRef.current = res.nextUsers;
      setUsers(res.nextUsers);
      void pushClubToCloud(res.nextUsers, sessionsRef.current);
      showToast(nextRole === 'admin' ? '已授权为赛事管理员并同步上云' : '已取消管理员权限并同步上云');
    },
    [currentUser, pushClubToCloud, showToast]
  );

  return (
    <div data-theme={activeTheme} className="relative min-h-screen text-[#F8FAFC] flex flex-col">
      {/* Full-Bleed Scenic Court Photography Atmosphere Layer */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <img
          src={themeCfg.bgImage}
          alt=""
          className="w-full h-full object-cover object-center scale-105 transition-all duration-700"
        />
        <div
          className="absolute inset-0 transition-colors duration-500"
          style={{
            background:
              'linear-gradient(180deg, var(--theme-scrim-top) 0%, var(--theme-scrim-mid) 45%, var(--theme-scrim-bot) 100%)',
          }}
        />
      </div>

      <TopNav
        activeTab={activeTab}
        activeTheme={activeTheme}
        currentUser={currentUser}
        onSelectTab={setActiveTab}
        onOpenThemeSwitcher={() => setThemeModalOpen(true)}
        onOpenReport={() => {
          setPosterSpotlightPlayerId(null);
          setReportOpen(true);
        }}
        rosterDirty={state.rosterDirty}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 pt-4 pb-24 md:pb-12">
        {activeTab === 'schedule' && (
          <ScheduleView
            state={state}
            sessions={sessions}
            activeTheme={activeTheme}
            currentUser={currentUser}
            avatarsByName={avatarsByName}
            cloudSyncStatus={cloudSyncStatus}
            standings={standings}
            fairness={fairness}
            activeRoundNumber={activeRoundNumber}
            roomCode={roomCode}
            onSelectSession={handleSelectSession}
            onCreateSession={handleCreateSession}
            onPromptLogin={() => setActiveTab('profile')}
            onSelectRound={setActiveRoundNumber}
            onOpenScore={(match) => setScoringMatchId(match.id)}
            onOpenAiPreview={(match) => setPreviewMatchId(match.id)}
            onOpenAiMatchmake={() => setAiMatchmakeOpen(true)}
            onOpenCloudSync={() => setCloudSyncOpen(true)}
            onSwapPlayers={handleSwapPlayers}
            onGenerateNextMexicano={handleGenerateNextMexicano}
            onRescheduleRemaining={handleRescheduleRemaining}
            onGoToStandings={() => setActiveTab('standings')}
            onGoToPlayers={() => setActiveTab('players')}
          />
        )}

        {activeTab === 'standings' && (
          <StandingsView
            state={state}
            standings={standings}
            fairness={fairness}
            playerMap={playerMap}
            avatarsByName={avatarsByName}
            completedMatches={completedMatches}
            totalMatches={totalMatches}
            onOpenReport={() => {
              setPosterSpotlightPlayerId(null);
              setReportOpen(true);
            }}
            onOpenPlayerPoster={(playerId) => {
              setPosterSpotlightPlayerId(playerId);
              setReportOpen(true);
            }}
          />
        )}

        {activeTab === 'players' && (
          <PlayersView
            state={state}
            players={state.players}
            registeredUsers={users}
            cloudSyncStatus={cloudSyncStatus}
            onSyncClubCloud={() => {
              void syncClubFromCloud(false);
            }}
            standings={standings}
            careerMemory={careerMemory}
            playedCountByPlayer={playedCountByPlayer}
            rosterDirty={state.rosterDirty}
            onAddPlayer={handleAddPlayer}
            onImportPlayers={handleImportPlayers}
            onToggleActive={handleToggleActive}
            onUpdateRating={handleUpdateRating}
            onApplyCalibratedRatings={handleApplyCalibratedRatings}
            onUpdateGender={handleUpdateGender}
            onRemovePlayer={handleRemovePlayer}
            onRescheduleRemaining={handleRescheduleRemaining}
          />
        )}

        {activeTab === 'setup' && (
          <SetupView
            state={state}
            activeTheme={activeTheme}
            currentUser={currentUser}
            fairness={fairness}
            roomCode={roomCode}
            onApplyConfigAndGenerate={handleApplyConfigAndGenerate}
            onShuffleSchedule={handleShuffleSchedule}
            onOpenCloudSync={() => setCloudSyncOpen(true)}
            onPromptLogin={() => setActiveTab('profile')}
            onResetDemo={handleResetDemo}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            currentUser={currentUser}
            allUsers={users}
            sessions={sessions}
            activeTheme={activeTheme}
            cloudSyncStatus={cloudSyncStatus}
            onSyncClubCloud={() => syncClubFromCloud(false)}
            onSelectTheme={(id) => {
              setActiveTheme(id);
              showToast(`已切换至「${getThemeConfig(id).name}」实景主题`);
            }}
            onLogin={handleLogin}
            onRegister={handleRegister}
            onLogout={handleLogout}
            onUpdateProfile={handleUpdateProfile}
            onToggleUserAdmin={handleToggleUserAdmin}
            onJumpToSession={(sid) => {
              handleSelectSession(sid);
              setActiveTab('schedule');
            }}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        currentUser={currentUser}
        onSelectTab={setActiveTab}
        rosterDirty={state.rosterDirty}
      />

      <ScoreSheet
        match={scoringMatch}
        playerMap={playerMap}
        avatarsByName={avatarsByName}
        targetScore={state.config.targetScore}
        winByTwo={state.config.winByTwo}
        onClose={() => setScoringMatchId(null)}
        onSaveScore={handleSaveScore}
        onClearScore={handleClearScore}
      />

      <MatchPreviewSheet
        match={previewMatch}
        playerMap={playerMap}
        standings={standings}
        targetScore={state.config.targetScore}
        onClose={() => setPreviewMatchId(null)}
      />

      <WeChatReportModal
        open={reportOpen}
        state={state}
        standings={standings}
        fairness={fairness}
        heroImageUrl={themeCfg.bgImage}
        avatarsByName={avatarsByName}
        initialSpotlightPlayerId={posterSpotlightPlayerId}
        onClose={() => {
          setReportOpen(false);
          setPosterSpotlightPlayerId(null);
        }}
      />

      <CloudSyncSheet
        open={cloudSyncOpen}
        state={state}
        roomCode={roomCode}
        onClose={() => setCloudSyncOpen(false)}
        onRoomCodeChange={setRoomCode}
        onApplyImportedState={handleApplyImportedState}
      />

      <AiMatchmakeSheet
        open={aiMatchmakeOpen}
        state={state}
        standings={standings}
        careerMemory={careerMemory}
        targetRoundNumber={activeRoundNumber}
        onClose={() => setAiMatchmakeOpen(false)}
        onApplyPlan={handleApplyAiPlan}
      />

      <ThemeSwitcherModal
        open={themeModalOpen}
        activeTheme={activeTheme}
        onSelectTheme={(id) => {
          setActiveTheme(id);
          showToast(`已切换至「${getThemeConfig(id).name}」实景主题`);
        }}
        onClose={() => setThemeModalOpen(false)}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl theme-accent-bg text-xs sm:text-sm font-bold shadow-xl whitespace-nowrap pointer-events-none"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
