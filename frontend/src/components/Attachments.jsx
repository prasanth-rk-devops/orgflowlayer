import { downloadFile } from '../api';

const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function Attachments({ requestId, files = [], onRemove, onError }) {
  if (!files.length) return null;
  const get = (f) => downloadFile(`/leave/${requestId}/attachments/${f.id}`, f.name).catch((e) => onError?.(e.message));
  return (
    <ul className="files">
      {files.map((f) => (
        <li key={f.id}>
          <button className="link" onClick={() => get(f)}>{f.name}</button>
          <span className="muted small"> {size(f.size)}</span>
          {onRemove && <button className="link danger small" onClick={() => onRemove(f)}> Remove</button>}
        </li>
      ))}
    </ul>
  );
}
