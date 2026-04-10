export interface FileAttachment {
    path: string;
    name: string;
}

export interface TodoItem {
    id: string;
    title: string;
    notes: string;
    completed: boolean;
    priority: boolean;
    createdAt: number;
    completedAt?: number;
    files: FileAttachment[];
}
