import { useEffect, useRef, useState } from 'react';

export function PlanNameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const valid = !!value.trim() && value.trim().length <= 500;
  return <label>方案名称<input aria-label="方案名称" value={value} maxLength={500} aria-invalid={!valid} onChange={e => setValue(e.target.value)} onBlur={() => { if (valid) { onRename(value); setValue(value.trim()); } }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />{!valid && <small className="error">名称不能为空，最多 500 个字符；原名称仍保留。</small>}</label>;
}

export function PlanActionDialog({ name, onClose, onRename }: { name: string; onClose: () => void; onRename: (name: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(name);
  const valid = !!value.trim() && value.trim().length <= 500;
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="plan-dialog" aria-labelledby="plan-action-title" onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); if (valid) { onRename(value.trim()); onClose(); } }}>
      <h2 id="plan-action-title">修改方案名称</h2>
      <label>方案新名称<input aria-label="方案新名称" value={value} maxLength={500} autoFocus onChange={e => setValue(e.target.value)} aria-invalid={!valid} />{!valid && <small className="error">请输入名称，最多 500 个字符。</small>}</label>
      <div className="dialog-actions"><button type="button" onClick={onClose}>取消</button><button type="submit" className="primary" disabled={!valid}>保存名称</button></div>
    </form>
  </dialog>;
}
