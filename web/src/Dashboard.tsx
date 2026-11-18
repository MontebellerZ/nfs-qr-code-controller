import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ApiError, errorMessage, post, request } from './api';
import type { Invoice, User } from './api';
import { Brand } from './App';
import { ScanDialog } from './ScanDialog';

interface UploadResult { name: string; success: boolean; message: string }

const dateLabel = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const displayKey = (key: string) => key.match(/.{1,4}/g)?.join(' ') ?? key;

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [results, setResults] = useState<UploadResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<Invoice[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState('');
  const [scanError, setScanError] = useState('');
  const [notice, setNotice] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    request<Invoice[]>('/invoices', { signal: controller.signal }).then(setInvoices).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(errorMessage(error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [reload]);

  const pending = invoices.filter(invoice => !invoice.completedAt);
  const completed = invoices.filter(invoice => invoice.completedAt);
  const visible = (tab === 'pending' ? pending : completed).filter(invoice =>
    invoice.fileName.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
    invoice.accessKey.includes(search.replace(/\s/g, '')));
  const chosen = pending.filter(invoice => selected.has(invoice.id));
  const locked = uploading || confirming || loggingOut;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setResults([]);
    setNotice('');
    for (const [index, file] of files.entries()) {
      setUploadProgress(`${index + 1} de ${files.length}: ${file.name}`);
      let result: UploadResult;
      try {
        if (!/\.(pdf|xml)$/i.test(file.name)) throw new Error('Envie somente PDF ou XML.');
        if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter entre 1 byte e 10 MB.');
        const body = new FormData();
        body.append('file', file);
        const invoice = await post<Invoice>('/invoices', body);
        setInvoices(current => [invoice, ...current]);
        result = { name: file.name, success: true, message: 'Chave encontrada. Nota adicionada às pendentes.' };
      } catch (error) {
        result = { name: file.name, success: false, message: errorMessage(error) };
        if (error instanceof ApiError && error.status === 401) {
          setResults(current => [...current, {
            ...result, message: 'Sua sessão expirou. Os arquivos restantes não foram enviados. Saia e entre novamente.',
          }]);
          break;
        }
      }
      setResults(current => [...current, result]);
    }
    setUploading(false);
    setUploadProgress('');
  }

  async function logout() {
    setLoggingOut(true);
    setActionError('');
    try {
      await post<void>('/auth/logout');
      onLogout();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout();
      else setActionError(errorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }

  function startScan(items: Invoice[]) {
    setScanError('');
    setNotice('');
    setQueue(items);
  }

  async function confirm() {
    const invoice = queue[0];
    if (!invoice || confirming) return;
    setConfirming(true);
    setScanError('');
    try {
      const updated = await post<Invoice>(`/invoices/${invoice.id}/complete`);
      setInvoices(current => current.map(item => item.id === updated.id ? updated : item));
      setSelected(current => {
        const next = new Set(current);
        next.delete(updated.id);
        return next;
      });
      setQueue(current => current.slice(1));
      setNotice('Confirmação salva. A nota está em Concluídas.');
    } catch (error) {
      setScanError(errorMessage(error));
    } finally {
      setConfirming(false);
    }
  }

  function toggle(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <>
    <header className="site-header">
      <Brand />
      <div className="account"><span title={user.email}>{user.email}</span>
        <button className="secondary small" onClick={logout} disabled={locked}>Sair</button>
      </div>
    </header>
    <main className="dashboard">
      <section className="page-heading">
        <div><span className="eyebrow">SEU CONTROLE PESSOAL</span><h1>Minhas notas</h1>
          <p className="muted">Do arquivo ao scan, sem perder a conta.</p></div>
        <span className="private-badge">Somente você tem acesso</span>
      </section>
      {actionError && <p className="message error" role="alert">{actionError}</p>}
      {notice && <p className="message success" role="status">{notice}</p>}
      <div className="summary">
        <div className="stat"><span>A escanear</span><strong>{loading || loadError ? '—' : pending.length}</strong><small>Esperando sua confirmação</small></div>
        <div className="stat done"><span>Concluídas</span><strong>{loading || loadError ? '—' : completed.length}</strong><small>Um passo a menos para lembrar</small></div>
        <div className="stat"><span>Total de notas</span><strong>{loading || loadError ? '—' : invoices.length}</strong><small>Todas em um só lugar</small></div>
      </div>
      <section className="upload-panel card" aria-labelledby="upload-title">
        <span className="upload-symbol" aria-hidden="true">↑</span>
        <div><h2 id="upload-title">Adicione suas notas fiscais</h2>
          <p>Selecione PDFs ou XMLs. Encontramos a chave de acesso automaticamente.</p>
          <small>NF-e e NFC-e · Até 10 MB por arquivo · Sem NFS-e ou OCR</small>
        </div>
        <input ref={inputRef} className="visually-hidden" type="file" id="upload-files"
          aria-label="Arquivos de notas fiscais" accept=".pdf,.xml" multiple onChange={upload}
          disabled={locked || loading || !!loadError} />
        <button onClick={() => inputRef.current?.click()} disabled={locked || loading || !!loadError}>
          {uploading ? 'Enviando…' : 'Selecionar arquivos'}
        </button>
      </section>
      {uploading && <p role="status" className="muted">Processando {uploadProgress}</p>}
      {results.length > 0 && <section className="upload-results card" aria-label="Resultado dos envios" aria-live="polite">
        <div className="section-title"><h3>Resultado dos envios</h3>
          <button className="text-button" disabled={uploading} onClick={() => setResults([])}>Limpar avisos</button></div>
        <ul>{results.map((result, index) => <li key={index} className={result.success ? 'result-ok' : 'result-error'}>
          <span className="result-dot" aria-hidden="true">{result.success ? '✓' : '!'}</span>
          <div><strong>{result.name}</strong><p>{result.message}</p></div>
        </li>)}</ul>
      </section>}
      <section className="invoice-section card" aria-label="Lista de notas">
        <div className="list-toolbar">
          <div className="tabs" aria-label="Status das notas">
            <button className={tab === 'pending' ? 'active' : ''} aria-pressed={tab === 'pending'}
              onClick={() => setTab('pending')}>Pendentes <span>{pending.length}</span></button>
            <button className={tab === 'completed' ? 'active' : ''} aria-pressed={tab === 'completed'}
              onClick={() => setTab('completed')}>Concluídas <span>{completed.length}</span></button>
          </div>
          <input type="search" aria-label="Buscar nota" placeholder="Buscar por arquivo ou chave…"
            value={search} onChange={event => setSearch(event.target.value)} />
        </div>
        {loading ? <p className="empty" role="status">Carregando suas notas…</p>
          : loadError ? <div className="empty"><p role="alert">{loadError}</p>
            <button onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div>
          : <>
            {tab === 'pending' && pending.length > 0 && <div className="selection-bar">
              <label className="checkbox-label"><input type="checkbox" disabled={locked || visible.length === 0}
                aria-label="Selecionar pendentes visíveis"
                checked={visible.length > 0 && visible.every(invoice => selected.has(invoice.id))}
                onChange={event => setSelected(current => {
                  const next = new Set(current);
                  visible.forEach(invoice => event.target.checked ? next.add(invoice.id) : next.delete(invoice.id));
                  return next;
                })} /> Selecionar visíveis</label>
              <button className="small" disabled={locked || chosen.length === 0}
                onClick={() => startScan(chosen)}>Escanear selecionadas ({chosen.length})</button>
            </div>}
            {visible.length === 0 ? <div className="empty">
              <span className="empty-icon" aria-hidden="true">▤</span>
              <h3>{search ? 'Nenhuma nota encontrada' : tab === 'pending' ? 'Tudo em dia por aqui' : 'Cada confirmação conta'}</h3>
              <p>{search ? 'Tente outro nome ou trecho da chave.' : tab === 'pending'
                ? 'Envie suas notas para começar. As pendentes aparecem aqui.'
                : 'Após escanear uma nota e confirmar, ela aparece nesta lista.'}</p>
            </div> : <ul className="invoice-list">
              {visible.map(invoice => <li className="invoice-row" key={invoice.id}>
                {tab === 'pending' && <input type="checkbox" checked={selected.has(invoice.id)} disabled={locked}
                  aria-label={`Selecionar ${invoice.fileName}`} onChange={() => toggle(invoice.id)} />}
                <span className="file-icon" aria-hidden="true">{invoice.fileName.split('.').pop()?.toUpperCase()}</span>
                <div className="invoice-content">
                  <h3>{invoice.fileName}</h3>
                  <code className="access-key">{displayKey(invoice.accessKey)}</code>
                  <small>Adicionada em {dateLabel(invoice.createdAt)}
                    {invoice.completedAt && ` · Concluída em ${dateLabel(invoice.completedAt)}`}</small>
                </div>
                {invoice.completedAt ? <span className="status-tag">✓ Concluída</span>
                  : <button className="secondary small" disabled={locked}
                    onClick={() => startScan([invoice])}>Escanear</button>}
              </li>)}
            </ul>}
          </>}
      </section>
      <p className="bottom-note">O QR Code contém a chave, não o link fiscal original. A aceitação da nota e a forma de leitura dependem da Méliuz. Copiar ou exibir o QR Code não conclui a nota automaticamente.</p>
    </main>
    {queue[0] && <ScanDialog invoice={queue[0]} remaining={queue.length} busy={confirming}
      error={scanError} onClose={() => setQueue([])} onConfirm={confirm} />}
  </>;
}
