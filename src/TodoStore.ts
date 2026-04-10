import * as vscode from 'vscode';
import { TodoItem, FileAttachment } from './types';

const STORAGE_KEY = 'todoPanel.items';

export class TodoStore {
    private items: TodoItem[] = [];
    private readonly state: vscode.Memento;
    private onDidChangeEmitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor(state: vscode.Memento) {
        this.state = state;
        this.items = state.get<TodoItem[]>(STORAGE_KEY, []);
    }

    getAll(): TodoItem[] {
        return [...this.items];
    }

    add(title: string, notes: string = ''): TodoItem {
        const item: TodoItem = {
            id: this.generateId(),
            title,
            notes,
            completed: false,
            priority: false,
            createdAt: Date.now(),
            files: [],
        };
        this.items.push(item);
        this.persist();
        return item;
    }

    update(id: string, changes: Partial<Pick<TodoItem, 'title' | 'notes'>>): void {
        const item = this.items.find(i => i.id === id);
        if (!item) { return; }
        if (changes.title !== undefined) { item.title = changes.title; }
        if (changes.notes !== undefined) { item.notes = changes.notes; }
        this.persist();
    }

    addFile(id: string, file: FileAttachment): void {
        const item = this.items.find(i => i.id === id);
        if (!item) { return; }
        if (!item.files) { item.files = []; }
        const alreadyAttached = item.files.some(f => f.path === file.path);
        if (!alreadyAttached) {
            item.files.push(file);
            this.persist();
        }
    }

    removeFile(id: string, filePath: string): void {
        const item = this.items.find(i => i.id === id);
        if (!item || !item.files) { return; }
        item.files = item.files.filter(f => f.path !== filePath);
        this.persist();
    }

    toggle(id: string): void {
        const item = this.items.find(i => i.id === id);
        if (!item) { return; }
        item.completed = !item.completed;
        item.completedAt = item.completed ? Date.now() : undefined;
        if (item.completed) { item.priority = false; }
        this.persist();
    }

    togglePriority(id: string): void {
        const item = this.items.find(i => i.id === id);
        if (!item || item.completed) { return; }
        item.priority = !item.priority;
        if (item.priority) {
            // Move to top of list
            this.items = this.items.filter(i => i.id !== id);
            this.items.unshift(item);
        }
        this.persist();
    }

    remove(id: string): void {
        this.items = this.items.filter(i => i.id !== id);
        this.persist();
    }

    reorder(fromId: string, toId: string): void {
        const fromIdx = this.items.findIndex(i => i.id === fromId);
        const toIdx = this.items.findIndex(i => i.id === toId);
        if (fromIdx === -1 || toIdx === -1) { return; }
        const [moved] = this.items.splice(fromIdx, 1);
        this.items.splice(toIdx, 0, moved);
        this.persist();
    }

    clearCompleted(): void {
        this.items = this.items.filter(i => !i.completed);
        this.persist();
    }

    private persist(): void {
        this.state.update(STORAGE_KEY, this.items);
        this.onDidChangeEmitter.fire();
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
}
