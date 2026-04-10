import * as vscode from 'vscode';
import { TodoViewProvider } from './TodoViewProvider';
import { TodoStore } from './TodoStore';

export function activate(context: vscode.ExtensionContext) {
    const store = new TodoStore(context.globalState);
    const provider = new TodoViewProvider(context.extensionUri, store);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('todoPanel.view', provider, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('todoPanel.addItem', () => {
            provider.postMessage({ command: 'focusNewItem' });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('todoPanel.clearCompleted', () => {
            store.clearCompleted();
            provider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('todoPanel.attachFile', (fileUri: vscode.Uri) => {
            if (fileUri) {
                provider.attachFileFromExplorer(fileUri);
            }
        })
    );

    // Handle opening files from webview links
    provider.onOpenFile((filePath: string) => {
        const uri = vscode.Uri.file(filePath);
        vscode.workspace.openTextDocument(uri).then(
            doc => vscode.window.showTextDocument(doc),
            () => vscode.env.openExternal(uri)
        );
    });
}

export function deactivate() {}
