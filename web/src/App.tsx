import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, errorMessage, post, request } from './api';
import type { User } from './api';
import { Dashboard } from './Dashboard';

export function Brand() {
  return <a className="brand" href="/" aria-label="Nota a nota, início">
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2" />
      </svg>
    </span>
    <span>nota a nota<small>CONTROLE DE SCANS</small></span>
  </a>;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request<User>('/auth/me', { signal: controller.signal }).then(setUser).catch((failure: unknown) => {
      if (!controller.signal.aborted && !(failure instanceof ApiError && failure.status === 401)) {
        setError(errorMessage(failure));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [retry]);

  if (loading) return <main className="loading-screen" role="status">Abrindo suas notas…</main>;
  if (error && !user) return <main className="connection-error card">
    <h1>Não foi possível abrir o sistema</h1>
    <p role="alert">{error}</p>
    <button onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>
  </main>;
  if (user) return <Dashboard user={user} onLogout={() => setUser(null)} />;
  return <Auth onAuthenticated={setUser} />;
}

function Auth({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await post<User>(register ? '/auth/register' : '/auth/login', { email, password });
      onAuthenticated(user);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-page">
    <header className="site-header"><Brand /><span className="quiet">Menos confusão. Mais organização.</span></header>
    <main className="auth-layout">
      <section className="auth-intro">
        <span className="eyebrow">UM LUGAR PARA SUAS NOTAS</span>
        <h1>Uma nota de cada vez.<br /><em>Nenhum scan esquecido.</em></h1>
        <p>Envie suas notas fiscais, encontre a chave de acesso e acompanhe o que você já escaneou no celular.</p>
        <ol className="steps">
          <li><span>01</span><div><strong>Envie o PDF ou XML</strong><small>Encontramos a chave de 44 dígitos para você.</small></div></li>
          <li><span>02</span><div><strong>Escaneie ou copie</strong><small>Abra o QR Code ou leve a chave para o aplicativo.</small></div></li>
          <li><span>03</span><div><strong>Confirme e organize</strong><small>Separe as concluídas das notas que ainda faltam.</small></div></li>
        </ol>
      </section>
      <section className="auth-card card" aria-labelledby="auth-title">
        <div className="segmented">
          <button type="button" className={!register ? 'active' : ''} disabled={busy}
            aria-pressed={!register} onClick={() => { setRegister(false); setError(''); }}>Entrar</button>
          <button type="button" className={register ? 'active' : ''} disabled={busy}
            aria-pressed={register} onClick={() => { setRegister(true); setError(''); }}>Criar conta</button>
        </div>
        <h2 id="auth-title">{register ? 'Seu controle começa aqui' : 'Bom ter você de volta'}</h2>
        <p className="muted">{register ? 'Crie sua conta e organize suas próprias notas.' : 'Entre para continuar de onde parou.'}</p>
        <form onSubmit={submit}>
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" required maxLength={254}
            placeholder="voce@exemplo.com" value={email} onChange={event => setEmail(event.target.value)} />
          <label htmlFor="password">Senha</label>
          <input id="password" type="password" autoComplete={register ? 'new-password' : 'current-password'}
            required minLength={register ? 8 : 1} maxLength={128}
            value={password} onChange={event => setPassword(event.target.value)}
            aria-describedby={register ? 'password-hint' : undefined} />
          {register && <small id="password-hint">8 a 128 caracteres, incluindo maiúscula, minúscula e número.</small>}
          {error && <p className="message error" role="alert">{error}</p>}
          <button className="wide" type="submit" disabled={busy}>
            {busy ? 'Aguarde…' : register ? 'Criar minha conta' : 'Entrar na minha conta'}
          </button>
        </form>
        <p className="privacy-note">Suas notas ficam visíveis somente na sua conta. Os arquivos originais não são armazenados.</p>
      </section>
    </main>
    <footer>Ferramenta independente, sem vínculo com a Méliuz. A conclusão é confirmada por você.</footer>
  </div>;
}
