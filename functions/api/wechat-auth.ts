interface Env {
  WECHAT_APP_ID?: string;
  WECHAT_APP_SECRET?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function escapeJsString(str: string): string {
  return JSON.stringify(str);
}

/**
 * Cloudflare Pages Function: GET /api/wechat-auth
 * Supports WeChat Service Account OAuth2 (snsapi_userinfo) to fetch real nickname + avatar:
 *  - ?action=status   -> check whether WECHAT_APP_ID & WECHAT_APP_SECRET are configured
 *  - ?action=url      -> build WeChat OAuth2 authorize URL for popup / redirect
 *  - ?action=callback&code=... -> exchange code for nickname + headimgurl (proxied to Data URL for Canvas export)
 */
export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'status';
  const appId = context.env.WECHAT_APP_ID?.trim();
  const appSecret = context.env.WECHAT_APP_SECRET?.trim();
  const configured = Boolean(appId && appSecret);

  if (action === 'status') {
    return jsonResponse({
      ok: true,
      configured,
      callbackUrl: `${url.origin}/api/wechat-auth?action=callback`,
    });
  }

  if (!configured || !appId || !appSecret) {
    return jsonResponse(
      {
        ok: false,
        configured: false,
        error: '尚未配置微信服务号 WECHAT_APP_ID 与 WECHAT_APP_SECRET 环境变量',
      },
      503
    );
  }

  if (action === 'url') {
    const callbackUrl = `${url.origin}/api/wechat-auth?action=callback`;
    const state = Math.random().toString(36).slice(2, 10);
    const authorizeUrl =
      `https://open.weixin.qq.com/connect/oauth2/authorize` +
      `?appid=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&response_type=code` +
      `&scope=snsapi_userinfo` +
      `&state=${state}#wechat_redirect`;
    return jsonResponse({ ok: true, url: authorizeUrl });
  }

  if (action === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) {
      return new Response('缺少微信授权 code 参数', { status: 400 });
    }

    try {
      const tokenRes = await fetch(
        `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
      );
      const tokenData = (await tokenRes.json()) as {
        access_token?: string;
        openid?: string;
        errmsg?: string;
      };

      if (!tokenData.access_token || !tokenData.openid) {
        return new Response(`微信授权失败：${tokenData.errmsg || '无法获取 access_token'}`, {
          status: 502,
        });
      }

      const infoRes = await fetch(
        `https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(tokenData.access_token)}&openid=${encodeURIComponent(tokenData.openid)}&lang=zh_CN`
      );
      const info = (await infoRes.json()) as {
        openid?: string;
        nickname?: string;
        headimgurl?: string;
        sex?: number;
        errmsg?: string;
      };

      if (!info.openid) {
        return new Response(`拉取微信资料失败：${info.errmsg || '未知错误'}`, { status: 502 });
      }

      // Proxy headimgurl into base64 Data URL so Canvas poster export never suffers CORS tainting
      let avatarDataUrl = info.headimgurl || '';
      if (avatarDataUrl.startsWith('http')) {
        try {
          const imgRes = await fetch(avatarDataUrl.replace(/^http:\/\//, 'https://'));
          if (imgRes.ok) {
            const buf = await imgRes.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const mime = imgRes.headers.get('content-type') || 'image/jpeg';
            avatarDataUrl = `data:${mime};base64,${btoa(binary)}`;
          }
        } catch {
          // Keep original HTTPS url if image fetch fails
        }
      }

      const payload = {
        type: 'WECHAT_AUTH_SUCCESS',
        profile: {
          openid: info.openid,
          nickname: info.nickname || '微信球友',
          avatarUrl: avatarDataUrl,
          gender: info.sex === 1 ? 'M' : info.sex === 2 ? 'F' : 'U',
        },
      };

      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>微信授权成功</title></head><body style="background:#0B0E14;color:#fff;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><p>微信资料同步成功，正在返回轻转匹克…</p><script>
        var data = ${escapeJsString(JSON.stringify(payload))};
        try {
          var parsed = JSON.parse(data);
          if (window.opener) {
            window.opener.postMessage(parsed, '*');
            window.close();
          } else {
            sessionStorage.setItem('qingzhuan_wechat_pending', data);
            window.location.replace('/');
          }
        } catch (e) { window.location.replace('/'); }
      </script></body></html>`;

      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '微信授权回调异常';
      return new Response(msg, { status: 500 });
    }
  }

  return jsonResponse({ ok: false, error: '不支持的 action 参数' }, 400);
};
