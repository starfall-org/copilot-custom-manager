import * as path from 'path';
import * as fs from 'fs';
import { getVSCodeUserDir, getChatLanguageModelsPath, stripComments, readChatLanguageModels, writeChatLanguageModels } from '../src/configLocator';
import * as vscode from 'vscode';

describe('configLocator tests', () => {
    const tempTestDir = path.join(__dirname, 'temp_user_dir');

    beforeEach(() => {
        if (fs.existsSync(tempTestDir)) {
            fs.rmSync(tempTestDir, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(tempTestDir)) {
            fs.rmSync(tempTestDir, { recursive: true, force: true });
        }
    });

    test('getVSCodeUserDir from globalStorageUri', () => {
        // Mock globalStorageUri: .../User/globalStorage/publisher.id
        const mockStoragePath = path.join(tempTestDir, 'globalStorage', 'jules.models-fetch-for-copilot');
        fs.mkdirSync(mockStoragePath, { recursive: true });

        const mockUri = vscode.Uri.file(mockStoragePath);
        const resolvedUserDir = getVSCodeUserDir(mockUri);

        expect(resolvedUserDir).toBe(tempTestDir);
    });

    test('stripComments removes JSON comments correctly', () => {
        const jsonWithComments = `
        // This is a comment
        {
            "name": "deepseek", /* multi line
            comment */
            "url": "https://example.com" // another comment
        }
        `;
        const expected = `

        {
            "name": "deepseek",
            "url": "https://example.com"
        }
        `;
        const result = stripComments(jsonWithComments);
        expect(JSON.parse(result)).toEqual({
            name: "deepseek",
            url: "https://example.com"
        });
    });

    test('read and write chatLanguageModels.json', () => {
        const filePath = path.join(tempTestDir, 'chatLanguageModels.json');
        const data = [
            {
                name: "DeepSeek",
                vendor: "customendpoint",
                apiKey: "sk-123",
                models: []
            }
        ];

        // Read non-existent file
        expect(readChatLanguageModels(filePath)).toEqual([]);

        // Write file
        writeChatLanguageModels(filePath, data);
        expect(fs.existsSync(filePath)).toBe(true);

        // Read written file
        const readData = readChatLanguageModels(filePath);
        expect(readData).toEqual(data);
    });
});
