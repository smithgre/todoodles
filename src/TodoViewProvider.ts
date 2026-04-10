import * as vscode from 'vscode';
import { TodoStore } from './TodoStore';

export class TodoViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private openFileEmitter = new vscode.EventEmitter<string>();

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly store: TodoStore
    ) {
        store.onDidChange(() => this.refresh());
    }

    onOpenFile(listener: (path: string) => void): void {
        this.openFileEmitter.event(listener);
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [this.extensionUri],
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        // Set badge immediately on resolve
        this.updateBadge();

        webviewView.webview.onDidReceiveMessage((msg) => {
            switch (msg.command) {
                case 'add':
                    this.store.add(msg.title, msg.notes ?? '');
                    break;
                case 'addAndEdit': {
                    this.store.add(msg.title, msg.notes ?? '');
                    break;
                }
                case 'toggle':
                    this.store.toggle(msg.id);
                    break;
                case 'update':
                    this.store.update(msg.id, { title: msg.title, notes: msg.notes });
                    break;
                case 'remove':
                    this.store.remove(msg.id);
                    break;
                case 'togglePriority':
                    this.store.togglePriority(msg.id);
                    break;
                case 'reorder':
                    this.store.reorder(msg.fromId, msg.toId);
                    break;
                case 'addFile':
                    this.store.addFile(msg.id, { path: msg.path, name: msg.name });
                    break;
                case 'removeFile':
                    this.store.removeFile(msg.id, msg.path);
                    break;
                case 'openFile':
                    this.openFileEmitter.fire(msg.path);
                    break;
                case 'pickFile':
                    this.pickFileForItem(msg.id);
                    break;
                case 'clearCompleted':
                    this.store.clearCompleted();
                    break;
                case 'ready':
                    this.sendItems();
                    break;
            }
        });
    }

    refresh(): void {
        this.sendItems();
    }

    postMessage(msg: unknown): void {
        this.view?.webview.postMessage(msg);
    }

    private sendItems(): void {
        const items = this.store.getAll();
        this.view?.webview.postMessage({
            command: 'setItems',
            items,
        });
        this.updateBadge();
    }

    private updateBadge(): void {
        if (this.view) {
            const activeCount = this.store.getAll().filter(i => !i.completed).length;
            this.view.title = activeCount > 0 ? `Todoodles (${activeCount})` : 'Todoodles';
            this.view.badge = activeCount > 0
                ? { value: activeCount, tooltip: `${activeCount} active item${activeCount !== 1 ? 's' : ''}` }
                : undefined;
        }
    }

    private async pickFileForItem(id: string): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: 'Attach',
            defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        });
        if (!uris || uris.length === 0) { return; }
        for (const uri of uris) {
            const filePath = uri.fsPath;
            const name = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
            this.store.addFile(id, { path: filePath, name });
        }
    }

    /** Called from Explorer context menu */
    async attachFileFromExplorer(fileUri: vscode.Uri): Promise<void> {
        const filePath = fileUri.fsPath;
        const name = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
        const activeItems = this.store.getAll().filter(i => !i.completed);

        if (activeItems.length === 0) {
            vscode.window.showWarningMessage('No active todos to attach to. Create one first.');
            return;
        }

        if (activeItems.length === 1) {
            this.store.addFile(activeItems[0].id, { path: filePath, name });
            return;
        }

        const pick = await vscode.window.showQuickPick(
            activeItems.map(i => ({ label: i.title, id: i.id })),
            { placeHolder: `Attach "${name}" to which todo?` }
        );
        if (!pick) { return; }
        this.store.addFile(pick.id, { path: filePath, name });
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = getNonce();
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')
        );

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
<link href="${codiconsUri}" rel="stylesheet" />
<style nonce="${nonce}">
/* ── Reset ───────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{
  height:100%;
  background:transparent;
  color:var(--vscode-foreground);
  font-family:var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size:var(--vscode-font-size, 13px);
  line-height:1.4;
}

/* ── Layout ──────────────────────────────────────── */
.container{display:flex;flex-direction:column;height:100%}
.list{flex:1;overflow-y:auto;overflow-x:hidden;padding:0;user-select:none;-webkit-user-select:none}
.list::-webkit-scrollbar{width:5px}
.list::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background);border-radius:4px}
.list::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-hoverBackground)}

/* ── Empty state ─────────────────────────────────── */
.empty{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:32px 16px;color:var(--vscode-descriptionForeground);text-align:center;gap:6px;
}
.empty .codicon{font-size:28px;opacity:.45}
.empty-text{font-size:12px;line-height:1.5}

/* ── Todo item ───────────────────────────────────── */
.todo-item{
  display:flex;align-items:flex-start;gap:8px;
  padding:6px 12px;
  transition:background .1s;
  cursor:default;position:relative;
}
.todo-item:hover{background:var(--vscode-list-hoverBackground)}
.todo-item.dragging{opacity:.3}
.todo-item.drag-over::after{
  content:'';position:absolute;left:8px;right:8px;top:0;
  border-top:2px solid var(--vscode-focusBorder);
}

/* ── Drag handle ────────────────────────────────────── */
.drag-handle{
  flex-shrink:0;width:14px;margin-top:3px;
  cursor:grab;color:var(--vscode-descriptionForeground);
  opacity:0;transition:opacity .1s;
  display:flex;align-items:center;justify-content:center;
}
.drag-handle:active{cursor:grabbing}
.todo-item:hover .drag-handle{opacity:.6}
.drag-handle:hover{opacity:1 !important}
.drag-handle .codicon{font-size:12px}
.todo-item.completed .drag-handle{display:none}
.todo-item.completed [data-action="attach"]{display:none}

/* ── Priority ────────────────────────────────────── */
.todo-item.priority{
  background:color-mix(in srgb, var(--vscode-charts-orange, #d18616) 8%, transparent);
  border-left:2px solid var(--vscode-charts-orange, #d18616);
  padding-left:10px;
}
.todo-item.priority:hover{
  background:color-mix(in srgb, var(--vscode-charts-orange, #d18616) 14%, transparent);
}
.priority-icon{
  color:var(--vscode-charts-orange, #d18616);
  font-size:12px;flex-shrink:0;margin-top:3px;
}

/* ── Checkbox ────────────────────────────────────── */
.checkbox{
  flex-shrink:0;width:16px;height:16px;margin-top:2px;
  border:1px solid var(--vscode-checkbox-border, var(--vscode-descriptionForeground));
  border-radius:3px;
  background:var(--vscode-checkbox-background, transparent);
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:all .15s;padding:0;
  color:var(--vscode-checkbox-foreground, var(--vscode-foreground));
}
.checkbox:hover{
  border-color:var(--vscode-focusBorder);
  background:var(--vscode-checkbox-selectBackground, rgba(255,255,255,.06));
}
.checkbox .codicon{font-size:12px;opacity:0;transition:opacity .12s}
.todo-item.completed .checkbox{
  background:var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder));
  border-color:var(--vscode-checkbox-selectBorder, var(--vscode-focusBorder));
}
.todo-item.completed .checkbox .codicon{opacity:1}

/* ── Content ─────────────────────────────────────── */
.item-content{flex:1;min-width:0}
.item-title{
  font-size:var(--vscode-font-size, 13px);
  color:var(--vscode-foreground);
  word-break:break-word;line-height:1.4;
}
.todo-item.completed .item-title{
  color:var(--vscode-disabledForeground);
  text-decoration:line-through;
}
.item-notes{
  font-size:calc(var(--vscode-font-size, 13px) - 1px);
  color:var(--vscode-descriptionForeground);
  margin-top:1px;word-break:break-word;white-space:pre-wrap;line-height:1.35;
}
.todo-item.completed .item-notes{
  color:var(--vscode-disabledForeground);opacity:.6;
}

/* ── File attachments ─────────────────────────────── */
.file-list{margin-top:4px;display:flex;flex-wrap:wrap;gap:3px}
.file-chip{
  display:inline-flex;align-items:center;gap:2px;
  padding:0 4px;
  border-radius:3px;
  background:transparent;
  border:1px dashed color-mix(in srgb, var(--vscode-descriptionForeground, #888) 35%, transparent);
  color:color-mix(in srgb, var(--vscode-descriptionForeground, #888) 80%, transparent);
  font-family:var(--vscode-font-family, sans-serif);
  font-size:10px;
  cursor:pointer;max-width:100%;
  transition:border-color .1s;
  text-decoration:none;
  line-height:16px;
}
.file-chip:hover{
  border-style:solid;
  border-color:color-mix(in srgb, var(--vscode-descriptionForeground, #888) 50%, transparent);
  background:color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
}
.file-chip .file-icon{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;margin-right:2px;width:11px;height:11px}
.file-chip .file-icon svg{display:block;width:11px;height:11px}
.file-chip .file-name{
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-style:italic;opacity:.85;
}
.file-chip .file-remove{
  margin-left:2px;
  color:var(--vscode-descriptionForeground);
  cursor:pointer;font-size:10px;flex-shrink:0;
  border:none;background:none;padding:0;
  display:inline-flex;align-items:center;
  opacity:0;transition:opacity .1s;
}
.file-chip:hover .file-remove{opacity:1}
.file-chip .file-remove:hover{color:var(--vscode-errorForeground)}
.todo-item.completed .file-chip{
  color:var(--vscode-disabledForeground);opacity:.6;
  border-color:var(--vscode-disabledForeground);
}

/* ── Actions (priority + attach + delete) ────────── */
.item-actions{
  display:flex;flex-direction:row;gap:2px;flex-shrink:0;margin-left:auto;
}
.action-btn{
  width:20px;height:20px;
  border:none;border-radius:3px;
  background:transparent;color:var(--vscode-descriptionForeground);
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity .1s,color .1s,background .1s;padding:0;
}
.todo-item:hover .action-btn{opacity:1}
.action-btn:hover{background:var(--vscode-toolbar-hoverBackground);color:var(--vscode-foreground)}
.action-btn.priority-btn:hover{color:var(--vscode-charts-orange, #d18616)}
.action-btn.priority-btn.is-priority{opacity:1;color:var(--vscode-charts-orange, #d18616)}
.action-btn.delete-btn:hover{color:var(--vscode-errorForeground)}
.action-btn .codicon{font-size:14px}

/* ── Completed section (sticky bottom) ───────────── */
.completed-section{
  flex-shrink:0;
  border-top:1px solid var(--vscode-widget-border, rgba(255,255,255,.08));
}
.section-toggle{
  display:flex;align-items:center;gap:4px;
  padding:6px 12px 4px;
  cursor:pointer;user-select:none;
  color:var(--vscode-descriptionForeground);
  font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;
}
.section-toggle:hover{color:var(--vscode-foreground)}
.section-toggle .codicon{font-size:12px;transition:transform .15s}
.section-toggle.collapsed .codicon{transform:rotate(-90deg)}
.section-toggle .count{
  font-size:10px;
  background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);
  padding:0 5px;border-radius:8px;font-weight:600;
}
.section-toggle .clear-btn{
  margin-left:auto;
  border:none;background:none;padding:2px 4px;
  color:var(--vscode-descriptionForeground);
  cursor:pointer;font-size:11px;border-radius:3px;
  display:flex;align-items:center;gap:3px;
  transition:color .1s,background .1s;
}
.section-toggle .clear-btn:hover{
  color:var(--vscode-foreground);
  background:var(--vscode-toolbar-hoverBackground);
}
.section-toggle .clear-btn .codicon{font-size:12px}
.completed-list{overflow-y:auto;max-height:200px}
.completed-list.hidden{display:none}

/* ── Input bar ───────────────────────────────────── */
.input-bar{
  position:sticky;bottom:0;flex-shrink:0;
  padding:6px 8px;
  background:var(--vscode-sideBar-background, var(--vscode-editor-background));
  border-top:1px solid var(--vscode-widget-border, rgba(255,255,255,.08));
}
.input-row{display:flex;gap:4px;align-items:center}
.input-title{
  flex:1;
  padding:4px 8px;
  border-radius:2px;
  border:1px solid var(--vscode-input-border, transparent);
  background:var(--vscode-input-background);
  color:var(--vscode-input-foreground);
  font-size:var(--vscode-font-size, 13px);font-family:inherit;
  outline:none;
}
.input-title:focus{border-color:var(--vscode-focusBorder)}
.input-title::placeholder{color:var(--vscode-input-placeholderForeground)}

.input-notes{
  display:none;width:100%;
  padding:4px 8px;margin-top:3px;
  border-radius:2px;
  border:1px solid var(--vscode-input-border, transparent);
  background:var(--vscode-input-background);
  color:var(--vscode-input-foreground);
  font-size:calc(var(--vscode-font-size, 13px) - 1px);font-family:inherit;
  resize:vertical;min-height:28px;max-height:80px;
  outline:none;
}
.input-notes:focus{border-color:var(--vscode-focusBorder)}
.input-notes::placeholder{color:var(--vscode-input-placeholderForeground)}
.input-bar.expanded .input-notes{display:block}

.icon-btn{
  flex-shrink:0;width:26px;height:26px;
  border-radius:3px;border:none;
  background:transparent;
  color:var(--vscode-descriptionForeground);
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:background .1s,color .1s;padding:0;
}
.icon-btn:hover{
  background:var(--vscode-toolbar-hoverBackground);
  color:var(--vscode-foreground);
}
.icon-btn.primary{
  background:var(--vscode-button-background);
  color:var(--vscode-button-foreground);
}
.icon-btn.primary:hover{background:var(--vscode-button-hoverBackground)}
.icon-btn .codicon{font-size:16px}

/* ── Inline editing ──────────────────────────────── */
.edit-title,.edit-notes{
  width:100%;padding:2px 4px;
  border:1px solid var(--vscode-focusBorder);border-radius:2px;
  background:var(--vscode-input-background);color:var(--vscode-input-foreground);
  font-size:inherit;font-family:inherit;outline:none;
}
.edit-notes{
  resize:vertical;min-height:22px;max-height:72px;
  margin-top:2px;font-size:calc(var(--vscode-font-size, 13px) - 1px);
}

/* ── Animations ──────────────────────────────────── */
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.todo-item.new{animation:fadeIn .18s ease-out}


</style>
</head>
<body>
<div class="container" id="container">
  <div class="list" id="list"></div>
  <div class="completed-section" id="completedSection" style="display:none">
    <div class="section-toggle collapsed" id="completedToggle">
      <span class="codicon codicon-chevron-down"></span>
      Completed
      <span class="count" id="completedCount">0</span>
      <button class="clear-btn" id="clearCompletedBtn" title="Clear completed"><span class="codicon codicon-clear-all"></span> Clear</button>
    </div>
    <div class="completed-list hidden" id="completedList"></div>
  </div>
  <div class="input-bar" id="inputBar">
    <div class="input-row">
      <input class="input-title" id="inputTitle" type="text" placeholder="Add Item" />
      <button class="icon-btn" id="toggleNotesBtn" title="Toggle notes">
        <span class="codicon codicon-note"></span>
      </button>
      <button class="icon-btn primary" id="addBtn" title="Add (Enter)">
        <span class="codicon codicon-add"></span>
      </button>
    </div>
    <textarea class="input-notes" id="inputNotes" placeholder="Notes…" rows="1"></textarea>
  </div>
</div>

<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  let items = [];
  let dragId = null;
  let completedVisible = false;
  let pendingEditId = null;
  let prevItemIds = new Set();

  // Restore collapsed state
  const prevState = vscode.getState();
  if (prevState && prevState.completedVisible !== undefined) {
    completedVisible = prevState.completedVisible;
  }

  const container = document.getElementById('container');
  const listEl = document.getElementById('list');
  const completedSection = document.getElementById('completedSection');
  const completedToggle = document.getElementById('completedToggle');
  const completedListEl = document.getElementById('completedList');
  const completedCountEl = document.getElementById('completedCount');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const inputTitle = document.getElementById('inputTitle');
  const inputNotes = document.getElementById('inputNotes');
  const inputBar = document.getElementById('inputBar');
  const addBtn = document.getElementById('addBtn');
  const toggleNotesBtn = document.getElementById('toggleNotesBtn');

  // Completed toggle listener (static, not re-attached on render)
  completedToggle.addEventListener('click', (e) => {
    if (e.target.closest('.clear-btn')) return;
    completedVisible = !completedVisible;
    vscode.setState({ completedVisible });
    completedToggle.classList.toggle('collapsed');
    completedListEl.classList.toggle('hidden');
  });

  clearCompletedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    vscode.postMessage({ command: 'clearCompleted' });
  });

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'setItems') {
      const oldIds = prevItemIds;
      items = msg.items;
      prevItemIds = new Set(items.map(i => i.id));
      render();
      // If we have a pending edit, find the newly added item and edit it
      if (pendingEditId === '__next__') {
        pendingEditId = null;
        const newItem = items.find(i => !oldIds.has(i.id));
        if (newItem) {
          const el = listEl.querySelector('[data-id="' + newItem.id + '"] [data-action="edit"]');
          if (el) startEditing(listEl.querySelector('[data-id="' + newItem.id + '"]'), newItem.id);
        }
      } else if (pendingEditId) {
        const editId = pendingEditId;
        pendingEditId = null;
        const itemEl = listEl.querySelector('[data-id="' + editId + '"]');
        if (itemEl) startEditing(itemEl, editId);
      }
    } else if (msg.command === 'focusNewItem') {
      inputTitle.focus();
    } else if (msg.command === 'editItem') {
      const itemEl = listEl.querySelector('[data-id="' + msg.id + '"]');
      if (itemEl) startEditing(itemEl, msg.id);
    }
  });

  // Double-click empty space in list to add new item in edit mode
  listEl.addEventListener('dblclick', (e) => {
    if (e.target === listEl || e.target.closest('.empty')) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      pendingEditId = '__next__';
      vscode.postMessage({ command: 'addAndEdit', title: 'Untitled', notes: '' });
    }
  });

  toggleNotesBtn.addEventListener('click', () => {
    inputBar.classList.toggle('expanded');
    if (inputBar.classList.contains('expanded')) inputNotes.focus();
  });

  addBtn.addEventListener('click', addItem);
  inputTitle.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addItem(); }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      inputBar.classList.add('expanded');
      inputNotes.focus();
    }
  });
  inputNotes.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); addItem(); }
  });

  function addItem() {
    const title = inputTitle.value.trim();
    if (!title) return;
    vscode.postMessage({ command: 'add', title, notes: inputNotes.value.trim() });
    inputTitle.value = '';
    inputNotes.value = '';
    inputBar.classList.remove('expanded');
    inputTitle.focus();
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fileName(p) {
    return p.split('/').pop().split('\\\\').pop() || p;
  }

  function fileIconSvg(name) {
    const ext = (name.lastIndexOf('.') > 0) ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
    var Y='#e8db52',B='#4fb4e0',O='#f5944e',G='#a0d468',K='#ff6b9d',P='#b898e0',R='#e85656',X='#8fa8b2';
    function s(b){return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none">'+b+'</svg>';}
    function sq(c){return s('<rect x="1" y="1" width="14" height="14" rx="2" fill="'+c+'" opacity="0.8"/>');}
    function ang(c){return s('<polyline points="6,3 2,8 6,13" stroke="'+c+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="10,3 14,8 10,13" stroke="'+c+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>');}
    function ha(c){return s('<line x1="5.5" y1="2" x2="4.5" y2="14" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/><line x1="11.5" y1="2" x2="10.5" y2="14" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/><line x1="2" y1="6" x2="14" y2="6" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/><line x1="2" y1="10.5" x2="14" y2="10.5" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/>');}
    function br(c){return s('<path d="M6 2.5C4.5 2.5 4 3.5 4 4.5v2C4 7.5 3 8 3 8s1 .5 1 1.5v2c0 1 .5 2 2 2" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/><path d="M10 2.5c1.5 0 2 1 2 2v2c0 1 1 1.5 1 1.5s-1 .5-1 1.5v2c0 1-.5 2-2 2" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/>');}
    function tm(c){return s('<polyline points="3,4 7.5,8 3,12" stroke="'+c+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="9" y1="12" x2="13" y2="12" stroke="'+c+'" stroke-width="1.5" stroke-linecap="round"/>');}
    function cy(c){return s('<ellipse cx="8" cy="4" rx="5" ry="2" stroke="'+c+'" stroke-width="1.2"/><path d="M3 4v8c0 1.1 2.24 2 5 2s5-.9 5-2V4" stroke="'+c+'" stroke-width="1.2"/><path d="M3 8c0 1.1 2.24 2 5 2s5-.9 5-2" stroke="'+c+'" stroke-width="1.2" opacity="0.4"/>');}
    function im(c){return s('<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="'+c+'" stroke-width="1.2"/><circle cx="5" cy="6" r="1.5" fill="'+c+'"/><polyline points="1.5,11.5 5,7.5 8,10 10.5,8 14.5,12" stroke="'+c+'" stroke-width="1.2" stroke-linejoin="round"/>');}
    function dc(c){return s('<path d="M4.5 1.5h5L13 5v8.5a1 1 0 01-1 1h-7.5a1 1 0 01-1-1v-11a1 1 0 011-1z" stroke="'+c+'" stroke-width="1.2"/><path d="M9.5 1.5v3.5H13" stroke="'+c+'" stroke-width="1.2" stroke-linejoin="round"/>');}
    function lk(c){return s('<rect x="3.5" y="7.5" width="9" height="6" rx="1" stroke="'+c+'" stroke-width="1.2"/><path d="M5.5 7.5V5.5a2.5 2.5 0 015 0v2" stroke="'+c+'" stroke-width="1.2" stroke-linecap="round"/>');}
    function ar(c){return s('<rect x="2" y="5.5" width="12" height="7.5" rx="1" stroke="'+c+'" stroke-width="1.2"/><path d="M2 5.5l1.5-3h9l1.5 3" stroke="'+c+'" stroke-width="1.2" stroke-linejoin="round"/><line x1="6.5" y1="8.5" x2="9.5" y2="8.5" stroke="'+c+'" stroke-width="1.2" stroke-linecap="round"/>');}
    function ge(c){return s('<circle cx="8" cy="8" r="2" stroke="'+c+'" stroke-width="1.2"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1" stroke="'+c+'" stroke-width="1.1" stroke-linecap="round"/>');}
    function ln(c){return s('<line x1="3" y1="4" x2="13" y2="4" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/><line x1="3" y1="8" x2="13" y2="8" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/><line x1="3" y1="12" x2="10" y2="12" stroke="'+c+'" stroke-width="1.3" stroke-linecap="round"/>');}
    function di(c){return s('<path d="M8 2L14 8 8 14 2 8z" stroke="'+c+'" stroke-width="1.3" stroke-linejoin="round"/>');}
    function ci(c){return s('<circle cx="8" cy="8" r="5.5" stroke="'+c+'" stroke-width="1.3"/>');}
    function ve(c){return s('<path d="M1 2.5h3.5L8 9 11.5 2.5H15L8 14.5z" stroke="'+c+'" stroke-width="1.2" stroke-linejoin="round"/>');}
    var m = {
      js:sq(Y),mjs:sq(Y),cjs:sq(Y),jsx:sq(Y),
      ts:sq(B),tsx:sq(B),
      html:ang(O),htm:ang(O),xml:ang(O),svg:ang(O),
      vue:ve(G),
      css:ha(B),scss:ha(K),less:ha(B),
      json:br(Y),php:br(P),blade:br(K),
      py:ci(B),go:ci(B),c:ci(B),cpp:ci(B),h:ci(P),
      rb:di(R),java:di(R),rs:ge(O),
      sh:tm(G),bash:tm(G),zsh:tm(G),
      yml:ge(P),yaml:ge(P),toml:ge(P),env:ge(Y),
      png:im(P),jpg:im(P),jpeg:im(P),gif:im(P),webp:im(P),ico:im(P),
      pdf:dc(R),md:ln(B),
      zip:ar(G),gz:ar(G),tar:ar(G),
      sql:cy(O),lock:lk(Y),log:ln(G),
    };
    return m[ext] || dc(X);
  }

  // ── Render ──────────────────────────────────────
  function render() {
    const active = items.filter(i => !i.completed);
    const done = items.filter(i => i.completed);

    if (active.length === 0 && done.length === 0) {
      listEl.innerHTML = '<div class="empty">'
        + '<span class="codicon codicon-checklist"></span>'
        + '<div class="empty-text">No items yet.<br>Add one below.</div>'
        + '</div>';
      completedSection.style.display = 'none';
      return;
    }

    let html = '';
    active.forEach(item => { html += renderItem(item); });
    if (active.length === 0) {
      html = '<div class="empty">'
        + '<span class="codicon codicon-checklist"></span>'
        + '<div class="empty-text">All done!</div>'
        + '</div>';
    }
    listEl.innerHTML = html;

    // Completed section
    if (done.length) {
      completedSection.style.display = '';
      completedCountEl.textContent = done.length;
      let doneHtml = '';
      done.forEach(item => { doneHtml += renderItem(item); });
      completedListEl.innerHTML = doneHtml;
    } else {
      completedSection.style.display = 'none';
    }

    attachListeners();
  }

  function renderItem(item) {
    let cls = 'todo-item';
    if (item.completed) cls += ' completed';
    if (item.priority && !item.completed) cls += ' priority';
    const notesHtml = item.notes
      ? '<div class="item-notes">' + esc(item.notes) + '</div>'
      : '';

    let filesHtml = '';
    if (item.files && item.files.length) {
      filesHtml = '<div class="file-list">';
      item.files.forEach(f => {
        filesHtml += '<span class="file-chip" data-file-path="' + esc(f.path) + '" title="' + esc(f.path) + '">'  
          + '<span class="file-icon">' + fileIconSvg(f.name) + '</span>'
          + '<span class="file-name">' + esc(f.name) + '</span>'
          + '<button class="file-remove" data-remove-path="' + esc(f.path) + '" title="Remove"><span class="codicon codicon-close"></span></button>'
          + '</span>';
      });
      filesHtml += '</div>';
    }

    const priorityIcon = (item.priority && !item.completed)
      ? '<span class="priority-icon"><span class="codicon codicon-flame"></span></span>'
      : '';

    return '<div class="' + cls + '" data-id="' + esc(item.id) + '">'  
      + '<span class="drag-handle" draggable="true" title="Drag to reorder"><span class="codicon codicon-gripper"></span></span>'
      + priorityIcon
      + '<button class="checkbox" data-action="toggle" title="' + (item.completed ? 'Mark incomplete' : 'Mark complete') + '">'
      + '<span class="codicon codicon-check"></span>'
      + '</button>'
      + '<div class="item-content" data-action="edit">'
      + '<div class="item-title">' + esc(item.title) + '</div>'
      + notesHtml
      + filesHtml
      + '</div>'
      + '<div class="item-actions">'
      + (item.completed ? '' : '<button class="action-btn priority-btn' + (item.priority ? ' is-priority' : '') + '" data-action="priority" title="' + (item.priority ? 'Remove priority' : 'Mark as priority') + '"><span class="codicon codicon-flame"></span></button>')
      + '<button class="action-btn" data-action="attach" title="Attach file">'
      + '<span class="codicon codicon-link"></span>'
      + '</button>'
      + '<button class="action-btn delete-btn" data-action="delete" title="Delete">'
      + '<span class="codicon codicon-trash"></span>'
      + '</button>'
      + '</div>'
      + '</div>';
  }

  // ── Event listeners ─────────────────────────────
  function attachListeners() {
    bindItemListeners(listEl);
    bindItemListeners(completedListEl);
  }

  function bindItemListeners(container) {
    container.querySelectorAll('.todo-item').forEach(el => {
      const id = el.dataset.id;

      el.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        vscode.postMessage({ command: 'toggle', id });
      });

      el.querySelector('[data-action="delete"]').addEventListener('click', () => {
        vscode.postMessage({ command: 'remove', id });
      });

      // Priority button
      const priorityBtn = el.querySelector('[data-action="priority"]');
      if (priorityBtn) {
        priorityBtn.addEventListener('click', () => {
          vscode.postMessage({ command: 'togglePriority', id });
        });
      }

      // Attach file button
      el.querySelector('[data-action="attach"]').addEventListener('click', () => {
        vscode.postMessage({ command: 'pickFile', id });
      });

      el.querySelector('[data-action="edit"]').addEventListener('dblclick', () => {
        startEditing(el, id);
      });

      // File chip click → open, remove button → detach
      el.querySelectorAll('.file-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          if (e.target.closest('.file-remove')) return;
          vscode.postMessage({ command: 'openFile', path: chip.dataset.filePath });
        });
      });
      el.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ command: 'removeFile', id, path: btn.dataset.removePath });
        });
      });

      // Drag to reorder (active items only)
      const handle = el.querySelector('.drag-handle');
      if (handle) {
        handle.addEventListener('dragstart', e => {
          dragId = id;
          el.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
        });
        handle.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          listEl.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
          dragId = null;
        });
        el.addEventListener('dragover', e => {
          if (!dragId || dragId === id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', e => {
          if (!el.contains(e.relatedTarget)) {
            el.classList.remove('drag-over');
          }
        });
        el.addEventListener('drop', e => {
          e.preventDefault();
          el.classList.remove('drag-over');
          if (dragId && dragId !== id) {
            vscode.postMessage({ command: 'reorder', fromId: dragId, toId: id });
          }
        });
      }
    });
  }

  // ── Inline editing ────────────────────────────
  function startEditing(el, id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const contentEl = el.querySelector('.item-content');
    const titleInput = document.createElement('input');
    titleInput.className = 'edit-title';
    titleInput.value = item.title;

    const notesInput = document.createElement('textarea');
    notesInput.className = 'edit-notes';
    notesInput.value = item.notes || '';
    notesInput.placeholder = 'Add notes…';

    contentEl.innerHTML = '';
    contentEl.appendChild(titleInput);
    contentEl.appendChild(notesInput);
    titleInput.focus();
    titleInput.select();

    function save() {
      const newTitle = titleInput.value.trim();
      if (newTitle) {
        vscode.postMessage({ command: 'update', id, title: newTitle, notes: notesInput.value.trim() });
      }
    }

    function handleBlur() {
      setTimeout(() => {
        if (!contentEl.contains(document.activeElement)) save();
      }, 100);
    }

    titleInput.addEventListener('blur', handleBlur);
    notesInput.addEventListener('blur', handleBlur);
    titleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { render(); }
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); notesInput.focus(); }
    });
    notesInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); save(); }
      if (e.key === 'Escape') { render(); }
    });
  }

  vscode.postMessage({ command: 'ready' });
})();
</script>
</body>
</html>`;
    }
}

function getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
