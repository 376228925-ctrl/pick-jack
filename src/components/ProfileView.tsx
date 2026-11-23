import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  Cloud,
  Edit3,
  History,
  Loader2,
  LogIn,
  LogOut,
  MessageCircle,
  Palette,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type { Gender, TournamentState, UserAccount } from '../types/tournament';
import {
  buildCareerReviewPayload,
  type AnalyzeApiResponse,
  type CareerReviewResult,
} from '../utils/aiAnalysis';
import { canManageAdmins, getRoleLabel } from '../utils/authStore';
import { compressAvatarFile, PRESET_AVATARS } from '../utils/avatarUtils';
import { extractPersonalHistory } from '../utils/sessionArchive';
import { SCENIC_THEMES, type ScenicThemeId } from '../utils/themes';

interface ProfileViewProps {
  currentUser: UserAccount | null;
  allUsers: UserAccount[];
  sessions: TournamentState[];
  activeTheme: ScenicThemeId;
  cloudSyncStatus: 'idle' | 'syncing' | 'synced' | 'local_only';
  onSyncClubCloud: () => void;
  onSelectTheme: (id: ScenicThemeId) => void;
  onLogin: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  onRegister: (input: {
    username: string;
    password: string;
    displayName: string;
    gender: Gender;
    dupr: number;
  }) => { ok: boolean; error?: string };
  onLogout: () => void;
  onUpdateProfile: (patch: {
    displayName?: string;
    avatarUrl?: string;
    gender?: Gender;
    dupr?: number;
    handedness?: 'right' | 'left';
    playStyle?: string;
    bio?: string;
  }) => void;
  onToggleUserAdmin: (targetUserId: string, nextRole: 'admin' | 'member') => void;
  onJumpToSession: (sessionId: string) => void;
}

export function ProfileView({
  currentUser,
  allUsers,
  sessions,
  activeTheme,
  cloudSyncStatus,
  onSyncClubCloud,
  onSelectTheme,
  onLogin,
  onRegister,
  onLogout,
  onUpdateProfile,
  onToggleUserAdmin,
  onJumpToSession,
}: ProfileViewProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regGender, setRegGender] = useState<Gender>('M');
  const [regDupr, setRegDupr] = useState(3.5);
  const [authError, setAuthError] = useState<string | null>(null);

  // Avatar picker & WeChat OAuth state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [wechatStatus, setWechatStatus] = useState<{
    configured: boolean;
    callbackUrl?: string;
  }>({ configured: false });
  const [wechatGuideOpen, setWechatGuideOpen] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<Gender>('M');
  const [editDupr, setEditDupr] = useState(3.5);
  const [editHand, setEditHand] = useState<'right' | 'left'>('right');
  const [editStyle, setEditStyle] = useState('');
  const [editBio, setEditBio] = useState('');

  // Personal AI Career Review state
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [review, setReview] = useState<CareerReviewResult | null>(null);

  useEffect(() => {
    fetch('/api/wechat-auth?action=status')
      .then((r) => r.json())
      .then((data: { configured?: boolean; callbackUrl?: string }) => {
        setWechatStatus({
          configured: Boolean(data.configured),
          callbackUrl: data.callbackUrl,
        });
      })
      .catch(() => {
        setWechatStatus({ configured: false });
      });
  }, []);

  const personalHistory = useMemo(() => {
    if (!currentUser) {
      return {
        records: [],
        games: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        pointDiff: 0,
        bestPartner: null,
      };
    }
    return extractPersonalHistory(sessions, [currentUser.displayName, currentUser.username]);
  }, [currentUser, sessions]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (authMode === 'login') {
      const res = await onLogin(username, password);
      if (!res.ok) {
        setAuthError(res.error || '登录失败');
      } else {
        setUsername('');
        setPassword('');
      }
      return;
    }

    const res = onRegister({
      username,
      password,
      displayName: regDisplayName || username,
      gender: regGender,
      dupr: regDupr,
    });
    if (!res.ok) {
      setAuthError(res.error || '注册失败');
    } else {
      setUsername('');
      setPassword('');
      setRegDisplayName('');
      setAuthMode('login');
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const dataUrl = await compressAvatarFile(file, 240);
      onUpdateProfile({ avatarUrl: dataUrl });
      setAvatarPickerOpen(false);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : '头像处理失败');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleWeChatSyncClick = async () => {
    if (!wechatStatus.configured) {
      setWechatGuideOpen(true);
      return;
    }
    setWechatLoading(true);
    try {
      const res = await fetch('/api/wechat-auth?action=url');
      const data = (await res.json()) as { ok?: boolean; url?: string };
      if (data.ok && data.url) {
        const isWeChatBrowser = /MicroMessenger/i.test(navigator.userAgent);
        if (isWeChatBrowser) {
          window.location.href = data.url;
        } else {
          const popup = window.open(data.url, 'wechat_oauth', 'width=540,height=680');
          if (!popup) {
            setWechatGuideOpen(true);
          }
        }
      } else {
        setWechatGuideOpen(true);
      }
    } catch {
      setWechatGuideOpen(true);
    } finally {
      setWechatLoading(false);
    }
  };

  const openEditProfile = () => {
    if (!currentUser) return;
    setEditName(currentUser.displayName);
    setEditGender(currentUser.gender);
    setEditDupr(currentUser.dupr);
    setEditHand(currentUser.handedness);
    setEditStyle(currentUser.playStyle);
    setEditBio(currentUser.bio);
    setEditing(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      displayName: editName.trim() || currentUser?.displayName || '球友',
      gender: editGender,
      dupr: editDupr,
      handedness: editHand,
      playStyle: editStyle.trim() || '均衡全能型',
      bio: editBio.trim(),
    });
    setEditing(false);
  };

  const handleRunCareerReview = async () => {
    if (!currentUser) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const payload = buildCareerReviewPayload({
        displayName: currentUser.displayName,
        dupr: currentUser.dupr,
        playStyle: currentUser.playStyle,
        handedness: currentUser.handedness,
        games: personalHistory.games,
        wins: personalHistory.wins,
        losses: personalHistory.losses,
        pointDiff: personalHistory.pointDiff,
        bestPartner: personalHistory.bestPartner,
        recentMatches: personalHistory.records,
      });

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'career_review',
          context: payload,
        }),
      });
      const json = (await res.json()) as AnalyzeApiResponse<CareerReviewResult>;
      if (!res.ok || !json.ok || !json.data) {
        setReviewError(json.error || 'AI 个人复盘暂时不可用');
        return;
      }
      setReview(json.data);
    } catch {
      setReviewError('网络异常，无法连接 DeepSeek 服务');
    } finally {
      setReviewLoading(false);
    }
  };

  const isSuperAdmin = canManageAdmins(currentUser);

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileChange}
        className="hidden"
        aria-label="上传个人头像图片"
      />

      {/* Scenic Theme Quick Bar + Cloud Sync Pill */}
      <section className="theme-glass border rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-bold text-white">
            <Palette className="w-4 h-4 theme-accent-text" aria-hidden="true" />
            <span>实景氛围主题</span>
          </div>
          <button
            type="button"
            onClick={onSyncClubCloud}
            className="min-h-[32px] px-3 rounded-xl bg-black/30 border border-white/15 text-[11px] font-semibold text-white/85 hover:bg-black/45 inline-flex items-center gap-1.5 cursor-pointer"
          >
            {cloudSyncStatus === 'syncing' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin theme-accent-text" aria-hidden="true" />
            ) : (
              <Cloud className="w-3.5 h-3.5 theme-accent-text" aria-hidden="true" />
            )}
            <span>
              {cloudSyncStatus === 'synced'
                ? '云端 KV 已互通 · 点此刷新'
                : cloudSyncStatus === 'syncing'
                ? '云端同步中…'
                : '同步云端俱乐部数据'}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SCENIC_THEMES.map((t) => {
            const active = activeTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTheme(t.id)}
                aria-pressed={active}
                className={`relative h-20 rounded-2xl overflow-hidden border text-left p-2.5 flex flex-col justify-end transition-all cursor-pointer ${
                  active
                    ? 'border-[var(--theme-accent)] ring-2 ring-[var(--theme-accent)]/45'
                    : 'border-white/15 hover:border-white/40'
                }`}
              >
                <img
                  src={t.bgImage}
                  alt={t.name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
                />
                <div className="relative z-10 flex items-center justify-between gap-1">
                  <span className="text-xs font-extrabold text-white">{t.name}</span>
                  {active && (
                    <span className="w-4 h-4 rounded-full theme-accent-bg flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* NOT LOGGED IN: Account Login / Registration Card */}
      {!currentUser ? (
        <section className="max-w-lg mx-auto theme-glass-strong border rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-bold theme-accent-text">个人档案 · 云端互通 · 权限认证</p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white">
              {authMode === 'login' ? '登录你的球手账号' : '注册新球手档案'}
            </h1>
            <p className="text-xs text-white/70">
              登录后可自定义头像、跨手机同步个人历史局、开启 DeepSeek 个人 AI 复盘。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-black/35 border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
              className={`min-h-[38px] rounded-lg text-xs font-bold transition-all cursor-pointer ${
                authMode === 'login' ? 'theme-accent-bg' : 'text-white/70 hover:text-white'
              }`}
            >
              账号登录
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
              }}
              className={`min-h-[38px] rounded-lg text-xs font-bold transition-all cursor-pointer ${
                authMode === 'register' ? 'theme-accent-bg' : 'text-white/70 hover:text-white'
              }`}
            >
              注册球友账号
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-3.5" noValidate>
            <div>
              <label htmlFor="auth-username" className="block text-xs font-semibold text-white/80 mb-1">
                登录账号
              </label>
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="例如 Jack 或你的专属用户名"
                autoComplete="username"
                className="w-full min-h-[44px] rounded-xl bg-black/35 border border-white/15 px-3.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--theme-accent)]"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-semibold text-white/80 mb-1">
                登录密码
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码（至少6位）"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                className="w-full min-h-[44px] rounded-xl bg-black/35 border border-white/15 px-3.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--theme-accent)]"
              />
            </div>

            {authMode === 'register' && (
              <>
                <div>
                  <label htmlFor="reg-display" className="block text-xs font-semibold text-white/80 mb-1">
                    场上显示昵称（用于自动匹配历史对局）
                  </label>
                  <input
                    id="reg-display"
                    type="text"
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    placeholder="请填写你在接龙中常用的名字，如 林叙"
                    className="w-full min-h-[44px] rounded-xl bg-black/35 border border-white/15 px-3.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--theme-accent)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-xs font-semibold text-white/80 mb-1">性别</span>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-black/35 border border-white/15 rounded-xl">
                      {(['M', 'F', 'U'] as Gender[]).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setRegGender(g)}
                          className={`min-h-[34px] rounded-lg text-xs font-bold cursor-pointer ${
                            regGender === g ? 'theme-accent-bg' : 'text-white/70'
                          }`}
                        >
                          {g === 'M' ? '男' : g === 'F' ? '女' : '保密'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="reg-dupr" className="block text-xs font-semibold text-white/80 mb-1">
                      自报 DUPR
                    </label>
                    <select
                      id="reg-dupr"
                      value={regDupr.toFixed(1)}
                      onChange={(e) => setRegDupr(Number(e.target.value))}
                      className="w-full min-h-[44px] rounded-xl bg-black/35 border border-white/15 px-3 text-sm font-mono text-white"
                    >
                      {[2.5, 3.0, 3.3, 3.5, 3.8, 4.0, 4.2, 4.5, 4.8].map((r) => (
                        <option key={r} value={r.toFixed(1)} className="bg-[#121622]">
                          {r.toFixed(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {authError && (
              <div
                role="alert"
                className="rounded-xl bg-[#3A1616] border border-[#FF6448]/45 px-3 py-2.5 text-xs text-[#FFB0A0] flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-[#FF6448]" aria-hidden="true" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full min-h-[46px] rounded-xl theme-accent-bg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              {authMode === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>立即登录</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  <span>创建球手档案并登录</span>
                </>
              )}
            </button>
          </form>

          {/* WeChat One-Tap Auth Entry */}
          <button
            type="button"
            onClick={handleWeChatSyncClick}
            disabled={wechatLoading}
            className="w-full min-h-[44px] rounded-xl bg-[#07C160]/18 hover:bg-[#07C160]/28 border border-[#07C160]/45 text-[#8CF0B6] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {wechatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
            )}
            <span>微信一键授权获取头像与昵称</span>
          </button>

          {authMode === 'login' && (
            <div className="pt-3 border-t border-white/10 text-xs text-white/65 space-y-1">
              <p>内置测试球友账号（密码均为 123456）：</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { u: 'linxu', label: '林叙（管理员）' },
                  { u: 'zhixia', label: '陈知夏（球友）' },
                  { u: 'beichen', label: '顾北辰（球友）' },
                ].map((acc) => (
                  <button
                    key={acc.u}
                    type="button"
                    onClick={() => {
                      setUsername(acc.u);
                      setPassword('123456');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-[11px] font-medium cursor-pointer"
                  >
                    填入 {acc.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        /* LOGGED IN: Athlete Profile + Avatar Studio + History + AI Career Review + RBAC */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-5">
            <section className="theme-glass-strong border rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setAvatarPickerOpen((v) => !v)}
                    aria-label="更换个人头像"
                    className="relative group w-16 h-16 rounded-2xl overflow-hidden shrink-0 shadow-lg border-2 border-white/25 hover:border-[var(--theme-accent)] transition-all cursor-pointer"
                  >
                    {currentUser.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full theme-accent-bg flex items-center justify-center text-2xl font-extrabold">
                        {currentUser.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-xl font-extrabold text-white truncate">
                        {currentUser.displayName}
                      </h1>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold theme-accent-text">
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{getRoleLabel(currentUser.role)}</span>
                      </span>
                    </div>
                    <p className="text-xs font-mono text-white/70 mt-0.5">
                      @{currentUser.username} · DUPR {currentUser.dupr.toFixed(1)} ·{' '}
                      {currentUser.handedness === 'left' ? '左手拍' : '右手拍'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpen((v) => !v)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold theme-accent-text hover:underline cursor-pointer"
                    >
                      <Camera className="w-3 h-3" aria-hidden="true" />
                      <span>{avatarPickerOpen ? '收起头像工坊' : '设置/上传头像（同步画报）'}</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="退出登录"
                  className="min-h-[38px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/85 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>退出</span>
                </button>
              </div>

              {/* Avatar Picker Drawer */}
              {avatarPickerOpen && (
                <div className="rounded-2xl bg-black/35 border border-white/15 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">选择球手头像</span>
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpen(false)}
                      aria-label="关闭头像面板"
                      className="text-white/60 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="min-h-[40px] px-3 rounded-xl theme-accent-bg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {avatarUploading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>相册上传头像</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleWeChatSyncClick}
                      disabled={wechatLoading}
                      className="min-h-[40px] px-3 rounded-xl bg-[#07C160]/20 hover:bg-[#07C160]/30 border border-[#07C160]/45 text-[#8CF0B6] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>微信获取头像</span>
                    </button>
                  </div>

                  {avatarError && (
                    <p role="alert" className="text-[11px] text-[#FFB0A0]">
                      {avatarError}
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <div className="text-[11px] text-white/60">或直接选用俱乐部质感插画头像：</div>
                    <div className="grid grid-cols-6 gap-2">
                      {PRESET_AVATARS.map((preset) => {
                        const selected = currentUser.avatarUrl === preset.dataUrl;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              onUpdateProfile({ avatarUrl: preset.dataUrl });
                              setAvatarPickerOpen(false);
                            }}
                            title={preset.label}
                            className={`aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                              selected
                                ? 'border-[var(--theme-accent)] scale-105'
                                : 'border-white/15 hover:border-white/50'
                            }`}
                          >
                            <img
                              src={preset.dataUrl}
                              alt={preset.label}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-black/25 border border-white/10 p-3.5 text-xs space-y-1.5">
                <div className="text-white/90 font-semibold">球风标签：{currentUser.playStyle}</div>
                <div className="text-white/65">{currentUser.bio || '暂未填写个人简介'}</div>
              </div>

              {!editing ? (
                <button
                  type="button"
                  onClick={openEditProfile}
                  className="w-full min-h-[42px] rounded-xl bg-white/10 hover:bg-white/16 border border-white/15 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>编辑个人资料与 DUPR</span>
                </button>
              ) : (
                <form
                  onSubmit={handleSaveProfile}
                  className="space-y-3 pt-2 border-t border-white/10"
                >
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-white/70 mb-1">场上昵称</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full min-h-[38px] rounded-xl bg-black/35 border border-white/15 px-3 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/70 mb-1">DUPR 水平</label>
                      <input
                        type="number"
                        step="0.1"
                        min="2.0"
                        max="6.0"
                        value={editDupr}
                        onChange={(e) => setEditDupr(Number(e.target.value) || 3.5)}
                        className="w-full min-h-[38px] rounded-xl bg-black/35 border border-white/15 px-3 text-xs font-mono text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-white/70 mb-1">惯用手</label>
                      <select
                        value={editHand}
                        onChange={(e) => setEditHand(e.target.value as 'right' | 'left')}
                        className="w-full min-h-[38px] rounded-xl bg-black/35 border border-white/15 px-3 text-xs text-white"
                      >
                        <option value="right" className="bg-[#121622]">右手持拍</option>
                        <option value="left" className="bg-[#121622]">左手持拍</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/70 mb-1">性别</label>
                      <select
                        value={editGender}
                        onChange={(e) => setEditGender(e.target.value as Gender)}
                        className="w-full min-h-[38px] rounded-xl bg-black/35 border border-white/15 px-3 text-xs text-white"
                      >
                        <option value="M" className="bg-[#121622]">男</option>
                        <option value="F" className="bg-[#121622]">女</option>
                        <option value="U" className="bg-[#121622]">保密</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/70 mb-1">球风标签</label>
                    <input
                      type="text"
                      value={editStyle}
                      onChange={(e) => setEditStyle(e.target.value)}
                      className="w-full min-h-[38px] rounded-xl bg-black/35 border border-white/15 px-3 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/70 mb-1">个人签名</label>
                    <input
                      type="text"
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full min-h-[38px] rounded-xl bg-black/35 border border-white/15 px-3 text-xs text-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 min-h-[40px] rounded-xl theme-accent-bg text-xs font-bold cursor-pointer"
                    >
                      保存资料
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="min-h-[40px] px-4 rounded-xl bg-white/10 text-xs text-white cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Super Admin Exclusive Role Management Panel */}
            {isSuperAdmin && (
              <section className="theme-glass-strong border rounded-3xl p-5 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-white whitespace-nowrap">
                    <Shield className="w-4 h-4 theme-accent-text shrink-0" aria-hidden="true" />
                    <span>超级管理员 · 权限分配</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-white/60 whitespace-nowrap">
                      共 {allUsers.length} 位用户
                    </span>
                    <button
                      type="button"
                      onClick={onSyncClubCloud}
                      disabled={cloudSyncStatus === 'syncing'}
                      className="min-h-[30px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-3 h-3 theme-accent-text shrink-0 ${
                          cloudSyncStatus === 'syncing' ? 'animate-spin' : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span>刷新云端</span>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-white/70">
                  由 Jack 授权为「赛事管理员」的用户，可在日历中发布每日新赛局与赛制规则（已接入 KV 云端同步）。
                </p>

                <div className="divide-y divide-white/10">
                  {allUsers.map((u) => (
                    <div
                      key={u.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt={u.displayName}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/20"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-white/12 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {u.displayName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">
                            {u.displayName}{' '}
                            <span className="font-mono font-normal text-white/55">
                              @{u.username}
                            </span>
                          </div>
                          <div className="text-[11px] text-white/65">
                            {getRoleLabel(u.role)} · DUPR {u.dupr.toFixed(1)}
                          </div>
                        </div>
                      </div>

                      {u.role === 'super_admin' ? (
                        <span className="text-[11px] font-bold theme-accent-text shrink-0">
                          最高权限
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onToggleUserAdmin(u.id, u.role === 'admin' ? 'member' : 'admin')
                          }
                          className={`min-h-[34px] px-3 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            u.role === 'admin'
                              ? 'bg-white/12 text-white hover:bg-[#3A1616] hover:text-[#FF8B73]'
                              : 'theme-accent-bg'
                          }`}
                        >
                          {u.role === 'admin' ? '取消管理员' : '设为管理员'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Personal Isolated Career Stats + DeepSeek AI Review + History Timeline */}
          <div className="lg:col-span-7 space-y-5">
            <section className="theme-glass-strong border rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold theme-accent-text">
                    <History className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>个人隔离档案 · 跨日期全记录</span>
                  </div>
                  <h2 className="text-lg font-extrabold text-white mt-0.5">
                    {currentUser.displayName} 的历史战绩总览
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handleRunCareerReview}
                  disabled={reviewLoading || personalHistory.games === 0}
                  className="min-h-[42px] px-4 rounded-xl theme-accent-bg text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
                >
                  {reviewLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{reviewLoading ? 'DeepSeek 复盘中…' : '个人记录 AI 深度复盘'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-2xl bg-black/30 border border-white/10 p-3.5">
                  <div className="text-[11px] text-white/65">累计完赛</div>
                  <div className="font-score italic text-3xl font-extrabold text-white mt-0.5 leading-none">
                    {personalHistory.games}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/30 border border-white/10 p-3.5">
                  <div className="text-[11px] text-white/65">胜负 / 胜率</div>
                  <div className="font-score italic text-2xl font-extrabold theme-accent-text mt-0.5 leading-none">
                    {personalHistory.wins}W-{personalHistory.losses}L
                  </div>
                  <div className="text-[10px] font-mono text-white/60 mt-1">
                    {personalHistory.games > 0
                      ? `${Math.round(personalHistory.winRate * 100)}%`
                      : '--'}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/30 border border-white/10 p-3.5">
                  <div className="text-[11px] text-white/65">累计净胜分</div>
                  <div
                    className={`font-score italic text-3xl font-extrabold mt-0.5 leading-none ${
                      personalHistory.pointDiff >= 0 ? 'text-[#34E39C]' : 'text-[#FF7861]'
                    }`}
                  >
                    {personalHistory.pointDiff > 0
                      ? `+${personalHistory.pointDiff}`
                      : personalHistory.pointDiff}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/30 border border-white/10 p-3.5">
                  <div className="text-[11px] text-white/65">最佳拍档</div>
                  <div className="text-base font-extrabold text-white mt-1 truncate">
                    {personalHistory.bestPartner?.name || '--'}
                  </div>
                  {personalHistory.bestPartner && (
                    <div className="text-[10px] font-mono text-white/60 mt-0.5">
                      {personalHistory.bestPartner.wins}胜/{personalHistory.bestPartner.games}场
                    </div>
                  )}
                </div>
              </div>

              {reviewError && (
                <p role="alert" className="text-xs text-[#FF8B73]">
                  {reviewError}
                </p>
              )}

              {review && (
                <div className="rounded-2xl bg-black/40 border border-[var(--theme-accent)]/45 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold theme-accent-text">
                      球手画像 · {review.archetype}
                    </span>
                    <span className="text-xs font-bold text-white">{review.headline}</span>
                  </div>
                  <p className="text-xs text-white/85 leading-relaxed">{review.trendAnalysis}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="rounded-xl bg-white/[0.06] p-3">
                      <div className="font-bold text-[#34E39C] mb-1">核心优势</div>
                      <p className="text-white/80 leading-relaxed">{review.strengths}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.06] p-3">
                      <div className="font-bold text-[#FF8E62] mb-1">失分盲区</div>
                      <p className="text-white/80 leading-relaxed">{review.blindSpots}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <div className="text-xs font-bold text-white">下次上场专项计划</div>
                    <ul className="space-y-1 text-xs text-white/85">
                      {review.nextSessionPlan.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-mono font-bold theme-accent-text">
                            0{idx + 1}
                          </span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>

            {/* Personal Match-by-Match Historical Timeline */}
            <section className="theme-glass-strong border rounded-3xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between text-xs">
                <span className="font-bold text-white">我的历史对局明细</span>
                <span className="font-mono text-white/60">
                  共 {personalHistory.records.length} 场
                </span>
              </div>

              {personalHistory.records.length === 0 ? (
                <div className="p-8 text-center space-y-2 text-xs text-white/70">
                  <p className="text-sm font-bold text-white">
                    暂无与「{currentUser.displayName}」匹配的完赛记录
                  </p>
                  <p>
                    当你参与的赛局录入比分后，系统会自动按你的场上昵称归档到这里；你也可以在左侧资料中将昵称改为赛场接龙名。
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.08]">
                  {personalHistory.records.map((rec, i) => (
                    <div
                      key={`${rec.sessionId}-${rec.roundNumber}-${i}`}
                      className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-[11px] font-mono text-white/65">
                          <Calendar className="w-3 h-3 theme-accent-text" aria-hidden="true" />
                          <span>{rec.sessionDate}</span>
                          <span>·</span>
                          <span className="truncate font-sans">{rec.sessionTitle}</span>
                        </div>
                        <div className="text-xs sm:text-sm font-semibold text-white">
                          搭档 <span className="theme-accent-text">{rec.partnerName}</span> vs{' '}
                          {rec.opponentNames[0]} / {rec.opponentNames[1]}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div
                            className={`font-score italic text-xl font-extrabold leading-none ${
                              rec.won ? 'text-[#34E39C]' : 'text-[#FF7861]'
                            }`}
                          >
                            {rec.myScore}:{rec.oppScore}
                          </div>
                          <div className="text-[10px] font-mono text-white/60 mt-0.5">
                            {rec.won ? '胜' : '负'} (
                            {rec.pointDiff > 0 ? `+${rec.pointDiff}` : rec.pointDiff})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onJumpToSession(rec.sessionId)}
                          className="min-h-[34px] px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white cursor-pointer"
                        >
                          看当日
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* WeChat OAuth Configuration & Instant Album Import Helper Modal */}
      {wechatGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setWechatGuideOpen(false)}
        >
          <div
            className="w-full max-w-md theme-glass-strong border rounded-3xl p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-base font-extrabold text-white">
                <MessageCircle className="w-5 h-5 text-[#07C160]" aria-hidden="true" />
                <span>微信一键获取头像说明</span>
              </div>
              <button
                type="button"
                onClick={() => setWechatGuideOpen(false)}
                aria-label="关闭说明弹窗"
                className="p-1.5 rounded-lg text-white/65 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-white/80 leading-relaxed">
              <p>
                后端微信 OAuth2 授权接口（<code className="font-mono text-[#8CF0B6]">/api/wechat-auth</code>）已内置完成。按微信官方规则，自动拉取微信头像与昵称需具备<strong>已认证的微信服务号</strong>：
              </p>
              <ol className="list-decimal list-inside space-y-1 text-white/75">
                <li>在 Cloudflare Pages 环境变量中添加 <code className="font-mono text-white">WECHAT_APP_ID</code> 与 <code className="font-mono text-white">WECHAT_APP_SECRET</code>（机密）。</li>
                <li>在微信公众平台将本站域名填入「网页授权域名」。</li>
              </ol>
              {currentUser && (
                <p className="text-white/90 font-semibold pt-1">
                  暂未接入服务号？你现在就可以直接从手机相册一键上传自己的微信头像，同样会同步到云端与战报画报中！
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {currentUser && (
                <button
                  type="button"
                  onClick={() => {
                    setWechatGuideOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex-1 min-h-[42px] rounded-xl theme-accent-bg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>直接从相册上传头像</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setWechatGuideOpen(false)}
                className="min-h-[42px] px-4 rounded-xl bg-white/10 text-xs font-semibold text-white cursor-pointer"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
