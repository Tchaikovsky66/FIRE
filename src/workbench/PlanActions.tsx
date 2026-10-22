import { useEffect, useRef, useState } from 'react';

export function PlanNameField({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const valid = !!value.trim() && value.trim().length <= 500;
  return <label>方案名称<input aria-label="方案名称" value={value} maxLength={500} aria-invalid={!valid} onChange={e => setValue(e.target.value)} onBlur={() => { if (valid) { onRename(value); setValue(value.trim()); } }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />{!valid && <small className="error">名称不能为空，最多 500 个字符；原名称仍保留。</small>}</label>;
}

export function PlanActionDialog({ action, name, onClose, onRename, onDelete }: { action: 'rename' | 'delete'; name: string; onClose: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(name);
  const valid = !!value.trim() && value.trim().length <= 500;
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="plan-dialog" aria-labelledby="plan-action-title" onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); if (action === 'delete') onDelete(); else if (valid) { onRename(value.trim()); onClose(); } }}>
      <h2 id="plan-action-title">{action === 'rename' ? '修改方案名称' : '删除当前方案？'}</h2>
      {action === 'rename' ? <label>方案新名称<input aria-label="方案新名称" value={value} maxLength={500} autoFocus onChange={e => setValue(e.target.value)} aria-invalid={!valid} />{!valid && <small className="error">请输入名称，最多 500 个字符。</small>}</label> : <><p className="plan-delete-name">{name}</p><p>删除后无法恢复；如需保留，请先导出 JSON 备份。若已没有方案，将自动建立空白方案。</p></>}
      <div className="dialog-actions"><button type="button" autoFocus={action === 'delete'} onClick={onClose}>取消</button><button type="submit" className={action === 'delete' ? 'danger-button' : 'primary'} disabled={action === 'rename' && !valid}>{action === 'delete' ? '确认删除' : '保存名称'}</button></div>
    </form>
  </dialog>;
}
