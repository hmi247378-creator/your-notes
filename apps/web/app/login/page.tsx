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
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'radial-gradient(circle at top left, var(--accent-soft), transparent), radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.05), transparent)',
      padding: '1.5rem'
    }}>
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: '2.5rem', boxShadow: 'var(--shadow-xl)', border: 'none' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📓</div>
          <h1 className="sidebarTitle" style={{ fontSize: '2.25rem', marginBottom: '0.5rem', display: 'block' }}>你的笔记</h1>
          <p className="muted" style={{ fontSize: '1rem', margin: 0 }}>
            一句话记录，智能分门别类
          </p>
        </div>

        <div style={{ display: 'flex', background: 'var(--panel2)', padding: '4px', borderRadius: '12px', marginBottom: '1.5rem' }}>
          <button 
            className={`btn ${mode === 'login' ? 'btnPrimary' : ''}`} 
            style={{ flex: 1, border: 'none', boxShadow: mode === 'login' ? 'var(--shadow-sm)' : 'none' }}
            onClick={() => setMode('login')}
          >
            登录
          </button>
          <button
            className={`btn ${mode === 'register' ? 'btnPrimary' : ''}`}
            style={{ flex: 1, border: 'none', boxShadow: mode === 'register' ? 'var(--shadow-sm)' : 'none' }}
            onClick={() => setMode('register')}
          >
            注册
          </button>
        </div>

        <div className="col" style={{ gap: '1rem' }}>
          {mode === 'register' ? (
            <input className="input" placeholder="您的昵称" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          ) : null}
          <input className="input" placeholder="邮箱地址" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="input"
            placeholder="登录密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error ? (
            <div style={{ 
              padding: '0.875rem', 
              borderRadius: '10px', 
              fontSize: '0.8125rem', 
              background: 'rgba(239, 68, 68, 0.1)', 
              color: 'var(--danger)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              fontWeight: 500
            }}>
              ⚠️ {error}
            </div>
          ) : null}

          <button className="btn btnPrimary" style={{ padding: '0.875rem', fontSize: '1rem', marginTop: '0.5rem' }} onClick={submit} disabled={loading}>
            {loading ? '同步中…' : mode === 'login' ? '开启智能笔记' : '立即注册账号'}
          </button>

          <p className="muted" style={{ fontSize: '0.75rem', textAlign: 'center', marginTop: '1rem' }}>
            Powered by Cloudflare Workers AI & D1
          </p>
        </div>
      </div>
    </div>
  );
}

