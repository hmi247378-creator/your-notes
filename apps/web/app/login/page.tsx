'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type AuthResp = { token: string; user: { id: string; nickname?: string | null } };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (mode === 'login' ? '登录' : '注册'), [mode]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        mode === 'login' ? { email, password } : { email, password, nickname: nickname || undefined };
      const data = await apiFetch<AuthResp>(path, { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem('yn_token', data.token);
      router.replace('/app');
    } catch (e: any) {
      setError(e?.message ?? '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 'var(--font-title)', fontWeight: 700 }}>你的笔记</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 'var(--font-body-sm)' }}>
              一句话记录，自动分门别类
            </div>
          </div>
          <div className="row">
            <button className={`btn ${mode === 'login' ? 'btnPrimary' : ''}`} onClick={() => setMode('login')}>
              登录
            </button>
            <button
              className={`btn ${mode === 'register' ? 'btnPrimary' : ''}`}
              onClick={() => setMode('register')}
            >
              注册
            </button>
          </div>
        </div>

        <div className="col" style={{ marginTop: 16 }}>
          {mode === 'register' ? (
            <input className="input" placeholder="昵称（可选）" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          ) : null}
          <input className="input" placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="input"
            placeholder="密码（>=6位）"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error ? (
            <div className="card" style={{ borderColor: 'rgba(220,38,38,0.4)', background: 'rgba(220,38,38,0.08)' }}>
              {error}
            </div>
          ) : null}

          <button className="btn btnPrimary" onClick={submit} disabled={loading}>
            {loading ? '处理中…' : title}
          </button>

          <div className="muted" style={{ fontSize: 'var(--font-small)' }}>
            API 地址：{process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api'}
          </div>
        </div>
      </div>
    </div>
  );
}

