import { useState } from 'react';
import { api, downloadTicketAttachment } from '../api/client.js';
import { Field, formatDateTime } from './ui.jsx';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TicketAttachments({ ticketId, attachments = [], role = 'author', onUploaded }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function selectFiles(event) {
    const selected = Array.from(event.target.files || []);
    setError('');
    if (selected.length > MAX_FILES) {
      setFiles([]);
      setError('Choose no more than 5 files at a time.');
    } else if (selected.some((file) => file.size > MAX_FILE_SIZE)) {
      setFiles([]);
      setError('Each file must be 25 MB or smaller.');
    } else {
      setFiles(selected);
    }
  }

  async function upload(event) {
    event.preventDefault();
    if (!files.length) return;
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await api.uploadTicketAttachments(ticketId, files, role);
      setFiles([]);
      form.reset();
      await onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download(attachment) {
    setError('');
    try {
      const { blob, filename } = await downloadTicketAttachment(attachment.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="ticket-attachments">
      <h3>Attachments ({attachments.length})</h3>
      {attachments.length > 0 ? (
        <ul className="attachment-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <button className="attachment-link" type="button" onClick={() => download(attachment)}>
                {attachment.name}
              </button>
              <span className="muted">{formatSize(attachment.sizeBytes)} · {formatDateTime(attachment.createdAt)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No files uploaded yet.</p>}
      <form className="form-stack top-rule" onSubmit={upload}>
        <Field label="Add files" hint="PDF, JPG, PNG, GIF, WEBP, MP4, or WEBM · up to 5 files, 25 MB each.">
          <input type="file" accept={ACCEPTED_TYPES} multiple onChange={selectFiles} />
        </Field>
        {files.length > 0 && <p className="muted">{files.map((file) => file.name).join(', ')}</p>}
        {error && <div className="alert alert--error" role="alert">{error}</div>}
        <div className="form-actions">
          <button className="btn btn--secondary" disabled={busy || !files.length}>{busy ? 'Uploading…' : 'Upload files'}</button>
        </div>
      </form>
    </section>
  );
}
