import { useEffect, useRef, useState } from 'react';
import FolderComponent from '@/components/ui/folder-component';

export function FileImportDialog({ onClose, onChoose, onImport, message }: { onClose: () => void; onChoose: () => void; onImport: (file: File) => Promise<void>; message: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="plan-dialog import-dialog" aria-labelledby="import-title" onClose={onClose}>
    <button className="dialog-close" type="button" aria-label="关闭导入" onClick={onClose}>×</button>
    <span className="section-number">YOUR PLANS, IN ONE PLACE</span>
    <h2 id="import-title">把你的方案带回来。</h2>
    <p>选择一个 FIRE JSON 备份。导入后会创建独立副本。</p>
    <div className={`folder-drop${dragging ? ' is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file) void onImport(file); }}>
      <FolderComponent color="black" size="sm" role="button" tabIndex={0} aria-label="选择 JSON 备份文件" onClick={onChoose} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(); } }} />
      <span>点击文件夹，或拖放 JSON 文件到这里</span>
    </div>
    <button type="button" className="primary import-choose" onClick={onChoose}>选择 JSON 文件 ↗</button>
    {message && <p className="import-feedback" role="status">{message}</p>}
    <p className="hint">文件仅在本地读取，现有方案会被保留。</p>
  </dialog>;
}
