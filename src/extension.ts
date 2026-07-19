import * as vscode from 'vscode';
import * as fs from 'fs';
import { getChatLanguageModelsPath, readChatLanguageModels, writeChatLanguageModels } from './configLocator';
import { fetchModels } from './apiClient';
import { mergeModelsIntoConfig, ProviderConfig } from './configMerger';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "models-fetch-for-copilot" is now active!');

    const disposable = vscode.commands.registerCommand('models-fetch-for-copilot.fetchModels', async () => {
        try {
            // 1. Locate chatLanguageModels.json
            const configPath = getChatLanguageModelsPath(context.globalStorageUri);

            // Read existing configuration
            let configData: ProviderConfig[] = [];
            try {
                configData = readChatLanguageModels(configPath);
            } catch (err) {
                const choice = await vscode.window.showWarningMessage(
                    `Failed to parse chatLanguageModels.json: ${err instanceof Error ? err.message : String(err)}. Would you like to reset/initialize it?`,
                    'Reset to Empty',
                    'Cancel'
                );
                if (choice === 'Reset to Empty') {
                    configData = [];
                } else {
                    return;
                }
            }

            // 2. Filter customendpoint providers
            const customProviders = configData.filter(p => p.vendor === 'customendpoint');

            // Construct QuickPick items
            const quickPickItems: vscode.QuickPickItem[] = customProviders.map(p => ({
                label: p.name,
                description: `Custom Endpoint (${p.models?.length || 0} models)`,
                detail: p.apiKey?.startsWith('${input:') ? 'API Key: Secure' : 'API Key: Plaintext'
            }));

            quickPickItems.push({
                label: '$(plus) Create New Custom Endpoint Provider...',
                description: 'Configure a new OpenAI-compatible API'
            });

            const selectedProviderItem = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a custom provider to fetch models for, or create a new one'
            });

            if (!selectedProviderItem) {
                return; // User cancelled
            }

            let providerName = '';
            let baseUrl = '';
            let apiKey: string | undefined = '';
            let apiType = 'chat-completions';
            let isNewProvider = false;
            let existingProvider: ProviderConfig | undefined;

            if (selectedProviderItem.label.startsWith('$(plus)')) {
                isNewProvider = true;

                // Prompt for Provider Name
                const inputName = await vscode.window.showInputBox({
                    prompt: 'Enter Custom Endpoint Provider Name',
                    placeHolder: 'e.g., DeepSeek, OpenRouter, Local Ollama',
                    validateInput: text => text.trim() ? null : 'Provider name cannot be empty'
                });
                if (!inputName) {return;}
                providerName = inputName.trim();

                // Prompt for Base URL
                const inputBaseUrl = await vscode.window.showInputBox({
                    prompt: 'Enter API Base URL (e.g., https://api.deepseek.com/v1)',
                    placeHolder: 'https://api.deepseek.com/v1',
                    validateInput: text => text.trim() ? null : 'Base URL cannot be empty'
                });
                if (!inputBaseUrl) {return;}
                baseUrl = inputBaseUrl.trim();

                // Prompt for API Key
                const inputApiKey = await vscode.window.showInputBox({
                    prompt: 'Enter API Key (Optional. Leave blank if none or using secure storage)',
                    placeHolder: 'sk-...',
                    password: true
                });
                if (inputApiKey === undefined) {return;}
                apiKey = inputApiKey.trim() || undefined;

                // Prompt for API Type
                const selectedApiType = await vscode.window.showQuickPick(['chat-completions', 'messages', 'responses'], {
                    placeHolder: 'Select API Type (default is chat-completions)'
                });
                if (!selectedApiType) {return;}
                apiType = selectedApiType;

            } else {
                // User selected an existing provider
                existingProvider = customProviders.find(p => p.name === selectedProviderItem.label);
                if (!existingProvider) {
                    vscode.window.showErrorMessage('Selected provider not found.');
                    return;
                }
                providerName = existingProvider.name;
                apiType = existingProvider.apiType || 'chat-completions';

                // Try to infer Base URL from existing models' URLs
                let inferredBaseUrl = '';
                if (existingProvider.models && existingProvider.models.length > 0) {
                    const modelUrl = existingProvider.models[0].url;
                    inferredBaseUrl = modelUrl
                        .replace(/\/chat\/completions\/?$/, '')
                        .replace(/\/messages\/?$/, '')
                        .replace(/\/responses\/?$/, '');
                }

                // Prompt for Base URL, pre-filled with inferred one
                const inputBaseUrl = await vscode.window.showInputBox({
                    prompt: `Enter or verify Base URL for ${providerName}`,
                    value: inferredBaseUrl,
                    placeHolder: 'https://api.deepseek.com/v1',
                    validateInput: text => text.trim() ? null : 'Base URL cannot be empty'
                });
                if (!inputBaseUrl) {return;}
                baseUrl = inputBaseUrl.trim();

                // Handle API key
                const currentApiKey = existingProvider.apiKey || '';
                const isSecureKey = currentApiKey.startsWith('${input:');

                if (isSecureKey) {
                    // Prompt user to enter key temporarily for fetching
                    const tempKey = await vscode.window.showInputBox({
                        prompt: `Provider uses secure Copilot secret storage (${currentApiKey}). Please temporarily paste the API key to fetch models.`,
                        placeHolder: 'Your actual API key (will NOT be stored in plaintext)',
                        password: true,
                        validateInput: text => text.trim() ? null : 'API Key is required to fetch models'
                    });
                    if (!tempKey) {return;}
                    apiKey = tempKey.trim();
                } else {
                    // Plaintext key or empty
                    const inputApiKey = await vscode.window.showInputBox({
                        prompt: `Verify or enter API Key for ${providerName}`,
                        value: currentApiKey,
                        placeHolder: 'sk-...',
                        password: true
                    });
                    if (inputApiKey === undefined) {return;}
                    apiKey = inputApiKey.trim() || undefined;
                }
            }

            // 3. Fetch Models with a progress bar
            let fetchedModels: { id: string, name?: string }[] = [];
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Fetching models from ${providerName}...`,
                cancellable: false
            }, async () => {
                fetchedModels = await fetchModels(baseUrl, apiKey);
            });

            if (!fetchedModels || fetchedModels.length === 0) {
                vscode.window.showWarningMessage('No models were returned by the endpoint.');
                return;
            }

            // Get existing model IDs to pre-select
            const existingModelIds = new Set<string>();
            if (existingProvider?.models) {
                existingProvider.models.forEach(m => existingModelIds.add(m.id));
            }

            // 4. QuickPick to choose which models to add (multi-select)
            const modelItems: vscode.QuickPickItem[] = fetchedModels.map(m => ({
                label: m.id,
                description: m.name !== m.id ? m.name : undefined,
                picked: existingModelIds.has(m.id)
            }));

            const selectedModelItems = await vscode.window.showQuickPick(modelItems, {
                placeHolder: 'Select the models you want to configure for GitHub Copilot Chat',
                canPickMany: true
            });

            if (!selectedModelItems || selectedModelItems.length === 0) {
                vscode.window.showInformationMessage('No models selected. No changes made.');
                return;
            }

            const selectedModelIds = selectedModelItems.map(item => item.label);

            // Determine what API key we write back to the JSON file
            // If it was secure before, we keep the secure reference. Otherwise we write the entered key.
            let apiKeyToWrite: string | undefined;
            if (isNewProvider) {
                apiKeyToWrite = apiKey;
            } else {
                const currentApiKey = existingProvider?.apiKey;
                if (currentApiKey?.startsWith('${input:')) {
                    // Keep the secure reference so we don't leak/expose plaintext key in json
                    apiKeyToWrite = currentApiKey;
                } else {
                    apiKeyToWrite = apiKey;
                }
            }

            // 5. Merge models into config
            const updatedConfig = mergeModelsIntoConfig(
                configData,
                providerName,
                apiKeyToWrite,
                apiType,
                baseUrl,
                selectedModelIds
            );

            // 6. Save updated config
            writeChatLanguageModels(configPath, updatedConfig);

            // 7. Success message with option to open the config file
            const openChoice = await vscode.window.showInformationMessage(
                `Successfully configured ${selectedModelIds.length} models for "${providerName}"!`,
                'Open Config File',
                'Dismiss'
            );

            if (openChoice === 'Open Config File') {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
                await vscode.window.showTextDocument(doc);
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
