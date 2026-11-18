import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Invoice } from './api';

interface Props {
  invoice: Invoice;
  remaining: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ScanDialog({ invoice, remaining, busy, error, onClose, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keyRef = useRef<HTMLTextAreaElement>(null);
  const [copyMessage, setCopyMessage] = useState('');
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => setCopyMessage(''), [invoice.id]);

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(invoice.accessKey);
      setCopyMessage('Chave copiada! Cole no aplicativo do celular.');
    } catch {
      keyRef.current?.focus();
      keyRef.current?.select();
      setCopyMessage('Não foi possível copiar automaticamente. Copie a chave selecionada manualmente. A cópia automática exige HTTPS ou localhost e permissão do navegador.');
    }
  }

  return <dialog ref={dialogRef} className="scan-dialog" aria-labelledby="scan-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-top">
      <span className="eyebrow">HORA DO SCAN · {remaining} NA FILA</span>
      <button className="text-button" disabled={busy} onClick={onClose} aria-label="Fechar QR Code">Fechar</button>
    </div>
    <h2 id="scan-title">Leve esta nota para o celular</h2>
    <p className="dialog-file">{invoice.fileName}</p>
    <div className="qr-container">
      <QRCodeSVG value={invoice.accessKey} size={224} level="M" marginSize={4}
        role="img" aria-label="QR Code com a chave de acesso da nota" />
    </div>
    <p className="muted">Leia o QR Code com a câmera ou copie os 44 dígitos. Depois, use a chave no aplicativo.</p>
    <label htmlFor="scan-key">Chave de acesso</label>
    <textarea id="scan-key" ref={keyRef} className="key-field" value={invoice.accessKey}
      readOnly rows={2} onFocus={event => event.target.select()} />
    <button className="secondary wide" onClick={copy}>Copiar chave de acesso</button>
    {copyMessage && <p className="copy-message" role="status">{copyMessage}</p>}
    <div className="confirmation">
      <strong>Já terminou no aplicativo?</strong>
      <p>Confirme apenas depois de concluir o scan. Isso registra seu controle pessoal, não uma aprovação da Méliuz.</p>
      {error && <p className="message error" role="alert">{error}</p>}
      <button className="wide" disabled={busy} onClick={onConfirm}>
        {busy ? 'Salvando confirmação…' : 'Confirmar escaneamento'}
      </button>
    </div>
  </dialog>;
}
