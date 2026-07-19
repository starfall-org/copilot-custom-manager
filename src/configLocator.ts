import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

/**
 * Resolves the path to the VS Code User directory.
 * It first tries to derive it from the extension's globalStorageUri.
 * If that fails, it falls back to standard platform-specific paths.
 */
export function getVSCodeUserDir(globalStorageUri?: vscode.Uri): string {
    if (globalStorageUri && globalStorageUri.fsPath) {
        // globalStorageUri.fsPath is typically: .../User/globalStorage/publisher.extension-id
        // Going up two levels gives .../User
        const globalStorageDir = path.dirname(globalStorageUri.fsPath);
        const userDir = path.dirname(globalStorageDir);
        if (fs.existsSync(userDir)) {
            return userDir;
        }
    }

    // Fallbacks
    const home = os.homedir();
    const appData = process.env.APPDATA;
    const isInsiders = vscode.env.appName.includes('Insiders');
    const folderName = isInsiders ? 'Code - Insiders' : 'Code';

    if (process.platform === 'win32' && appData) {
        return path.join(appData, folderName, 'User');
    } else if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', folderName, 'User');
    } else {
        // Linux / other Unix
        return path.join(home, '.config', folderName, 'User');
    }
}

/**
 * Resolves the full path to chatLanguageModels.json.
 */
export function getChatLanguageModelsPath(globalStorageUri?: vscode.Uri): string {
    const userDir = getVSCodeUserDir(globalStorageUri);
    return path.join(userDir, 'chatLanguageModels.json');
}

/**
 * Strips single-line and multi-line comments from JSON string.
 */
export function stripComments(jsonText: string): string {
    return jsonText.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
}

/**
 * Safely reads and parses chatLanguageModels.json.
 * Returns an empty array if the file doesn't exist or is empty.
 */
export function readChatLanguageModels(filePath: string): any[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const rawContent = fs.readFileSync(filePath, 'utf8');
        const cleanContent = stripComments(rawContent).trim();
        if (!cleanContent) {
            return [];
        }
        return JSON.parse(cleanContent);
    } catch (error) {
        console.error('Failed to read or parse chatLanguageModels.json:', error);
        throw new Error(`Failed to parse chatLanguageModels.json: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Safely writes the array to chatLanguageModels.json.
 */
export function writeChatLanguageModels(filePath: string, data: any[]): void {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const jsonString = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonString, 'utf8');
    } catch (error) {
        console.error('Failed to write chatLanguageModels.json:', error);
        throw new Error(`Failed to save chatLanguageModels.json: ${error instanceof Error ? error.message : String(error)}`);
    }
}
