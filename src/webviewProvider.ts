import * as vscode from 'vscode';
import * as fs from 'fs';
import { getChatLanguageModelsPath, readChatLanguageModels, writeChatLanguageModels } from './configLocator';
import { fetchModels, resolveModelConfig } from './apiClient';
import { mergeModelsIntoConfig, ProviderConfig } from './configMerger';

export class CopilotModelsWebview {
    public static currentPanel: CopilotModelsWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, globalStorageUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (CopilotModelsWebview.currentPanel) {
            CopilotModelsWebview.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'copilotModelsManager',
            'Copilot Custom Endpoint Manager',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        CopilotModelsWebview.currentPanel = new CopilotModelsWebview(panel, extensionUri, globalStorageUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private readonly globalStorageUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                await this._handleMessage(message);
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        CopilotModelsWebview.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Copilot Custom Endpoint Manager</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background, #1e1e1e);
            --fg-color: var(--vscode-editor-foreground, #cccccc);
            --card-bg: var(--vscode-sideBar-background, #252526);
            --input-bg: var(--vscode-input-background, #3c3c3c);
            --input-fg: var(--vscode-input-foreground, #cccccc);
            --button-bg: var(--vscode-button-background, #0e639c);
            --button-fg: var(--vscode-button-foreground, #ffffff);
            --button-hover: var(--vscode-button-hoverBackground, #1177bb);
            --border-color: var(--vscode-panel-border, #474747);
        }
        body {
            background-color: var(--bg-color);
            color: var(--fg-color);
            font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
        }
        input, select, textarea {
            background-color: var(--input-bg);
            color: var(--input-fg);
            border: 1px solid var(--border-color);
        }
        input:focus, select:focus, textarea:focus {
            outline: 1px solid var(--vscode-focusBorder, #007fd4);
        }
    </style>
</head>
<body class="p-6">
    <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between border-b pb-4 mb-6" style="border-color: var(--border-color)">
            <div>
                <h1 class="text-2xl font-bold text-white flex items-center gap-2">
                    🤖 Copilot Custom Endpoint Manager
                </h1>
                <p class="text-sm opacity-70 mt-1">Quản lý và cập nhật cấu hình chatLanguageModels.json trực tiếp từ giao diện UI</p>
            </div>
            <div class="flex gap-2">
                <button id="btnReload" class="px-4 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 text-white font-semibold transition-colors">
                    🔄 Tải lại cấu hình
                </button>
                <button id="btnAddProvider" class="px-4 py-2 text-sm rounded font-semibold text-white transition-colors" style="background-color: var(--button-bg); hover:background-color: var(--button-hover)">
                    ➕ Thêm Endpoint mới
                </button>
            </div>
        </div>

        <!-- Main Workspace -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left 2 columns: Providers List & Models -->
            <div class="lg:col-span-2 space-y-6">
                <!-- Loader -->
                <div id="loader" class="text-center py-10">
                    <p class="text-lg animate-pulse">🔄 Đang tải cấu hình...</p>
                </div>

                <!-- Empty State -->
                <div id="emptyState" class="hidden text-center py-12 rounded-lg border-2 border-dashed p-6" style="border-color: var(--border-color)">
                    <p class="text-lg font-semibold">Chưa có nhà cung cấp Custom Endpoint nào</p>
                    <p class="text-sm opacity-60 mt-2">Bấm nút "Thêm Endpoint mới" ở góc trên hoặc nút bên dưới để tạo cấu hình đầu tiên.</p>
                    <button id="btnCreateFirst" class="mt-4 px-4 py-2 rounded text-sm font-semibold" style="background-color: var(--button-bg); color: var(--button-fg)">
                        Tạo Endpoint đầu tiên
                    </button>
                </div>

                <!-- Providers List -->
                <div id="providersList" class="space-y-6"></div>
            </div>

            <!-- Right column: Add/Edit Forms & Raw JSON -->
            <div class="space-y-6">
                <!-- Form Card -->
                <div id="formCard" class="hidden p-6 rounded-lg shadow-md border" style="background-color: var(--card-bg); border-color: var(--border-color)">
                    <h2 id="formTitle" class="text-lg font-bold mb-4 text-white">Thêm Endpoint Mới</h2>
                    <form id="providerForm" class="space-y-4 text-sm">
                        <input type="hidden" id="formIndex" value="">
                        <div>
                            <label class="block font-semibold mb-1">Tên nhà cung cấp (Name)</label>
                            <input type="text" id="providerName" class="w-full p-2 rounded" placeholder="Ví dụ: DeepSeek, OpenRouter, Local" required>
                        </div>
                        <div>
                            <label class="block font-semibold mb-1">Base URL (API Endpoint)</label>
                            <input type="text" id="providerUrl" class="w-full p-2 rounded" placeholder="Ví dụ: https://api.deepseek.com/v1" required>
                        </div>
                        <div>
                            <label class="block font-semibold mb-1">API Key (Plaintext hoặc Secure Reference)</label>
                            <input type="text" id="providerKey" class="w-full p-2 rounded" placeholder="sk-... hoặc để trống">
                            <p class="text-xs opacity-50 mt-1">Để bảo mật, bạn nên dùng cấu hình an toàn của VS Code hoặc để trống.</p>
                        </div>
                        <div>
                            <label class="block font-semibold mb-1">API Type</label>
                            <select id="providerApiType" class="w-full p-2 rounded">
                                <option value="chat-completions">chat-completions (OpenAI Compatible)</option>
                                <option value="messages">messages (Anthropic API)</option>
                                <option value="responses">responses (Azure responses)</option>
                            </select>
                        </div>
                        <div class="flex gap-2 pt-2">
                            <button type="submit" class="flex-1 py-2 rounded font-semibold" style="background-color: var(--button-bg); color: var(--button-fg)">
                                Lưu thông tin
                            </button>
                            <button type="button" id="btnCancelForm" class="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white font-semibold">
                                Huỷ bỏ
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Fetch Panel -->
                <div id="fetchCard" class="hidden p-6 rounded-lg shadow-md border" style="background-color: var(--card-bg); border-color: var(--border-color)">
                    <h2 class="text-lg font-bold mb-2 text-white">🔄 Tự động Fetch Models</h2>
                    <p class="text-xs opacity-70 mb-4">Gọi API đến nhà cung cấp để đồng bộ danh sách models mới nhất.</p>
                    <div id="fetchForm" class="space-y-4 text-sm">
                        <input type="hidden" id="fetchProviderName" value="">
                        <input type="hidden" id="fetchBaseUrl" value="">
                        <input type="hidden" id="fetchApiType" value="">
                        <div>
                            <label class="block font-semibold mb-1">API Key dùng để Fetch (Chỉ lưu tạm thời để gọi API)</label>
                            <input type="password" id="fetchApiKey" class="w-full p-2 rounded" placeholder="Nhập API Key sk-... để fetch">
                        </div>
                        <button id="btnExecuteFetch" class="w-full py-2 rounded font-semibold text-white transition-colors" style="background-color: var(--button-bg)">
                            Bắt đầu Fetch Models
                        </button>
                    </div>
                </div>

                <!-- Raw Config Viewer -->
                <div class="p-6 rounded-lg shadow-md border" style="background-color: var(--card-bg); border-color: var(--border-color)">
                    <h2 class="text-lg font-bold mb-2 text-white">📄 Xem cấu hình Raw JSON</h2>
                    <p class="text-xs opacity-70 mb-4">Nội dung thực tế của file chatLanguageModels.json tại máy của bạn.</p>
                    <textarea id="rawJsonArea" class="w-full h-64 p-2 rounded font-mono text-xs" readonly></textarea>
                </div>
            </div>
        </div>
    </div>

    <!-- Multi-select Model Modal (Floating popup) -->
    <div id="modelsModal" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
        <div class="rounded-lg max-w-xl w-full p-6 border shadow-2xl" style="background-color: var(--card-bg); border-color: var(--border-color)">
            <h3 class="text-lg font-bold text-white mb-2">Đồng bộ danh sách Models</h3>
            <p class="text-sm opacity-70 mb-4">Tích chọn các model bạn muốn cấu hình cho GitHub Copilot Chat:</p>

            <div class="max-h-80 overflow-y-auto space-y-2 mb-6 border p-2 rounded" style="border-color: var(--border-color)">
                <div id="modelsCheckboxList" class="space-y-1 text-sm">
                    <!-- Checkboxes inject dynamically -->
                </div>
            </div>

            <div class="flex gap-2">
                <button id="btnSaveFetchedModels" class="flex-1 py-2 rounded font-semibold" style="background-color: var(--button-bg); color: var(--button-fg)">
                    Xác nhận thêm
                </button>
                <button id="btnCancelModelsModal" class="flex-1 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white font-semibold">
                    Huỷ
                </button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function escapeHtml(unsafe) {
            if (!unsafe) return "";
            return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        let providersData = [];

        // Elements
        const loader = document.getElementById('loader');
        const emptyState = document.getElementById('emptyState');
        const providersList = document.getElementById('providersList');
        const btnReload = document.getElementById('btnReload');
        const btnAddProvider = document.getElementById('btnAddProvider');
        const btnCreateFirst = document.getElementById('btnCreateFirst');
        const formCard = document.getElementById('formCard');
        const formTitle = document.getElementById('formTitle');
        const providerForm = document.getElementById('providerForm');
        const formIndex = document.getElementById('formIndex');
        const providerNameInput = document.getElementById('providerName');
        const providerUrlInput = document.getElementById('providerUrl');
        const providerKeyInput = document.getElementById('providerKey');
        const providerApiTypeSelect = document.getElementById('providerApiType');
        const btnCancelForm = document.getElementById('btnCancelForm');
        const fetchCard = document.getElementById('fetchCard');
        const btnExecuteFetch = document.getElementById('btnExecuteFetch');
        const fetchApiKeyInput = document.getElementById('fetchApiKey');
        const fetchProviderName = document.getElementById('fetchProviderName');
        const fetchBaseUrl = document.getElementById('fetchBaseUrl');
        const fetchApiType = document.getElementById('fetchApiType');
        const rawJsonArea = document.getElementById('rawJsonArea');
        const modelsModal = document.getElementById('modelsModal');
        const modelsCheckboxList = document.getElementById('modelsCheckboxList');
        const btnSaveFetchedModels = document.getElementById('btnSaveFetchedModels');
        const btnCancelModelsModal = document.getElementById('btnCancelModelsModal');

        // Request initial load
        vscode.postMessage({ command: 'loadConfig' });

        // Event listeners
        btnReload.addEventListener('click', () => {
            vscode.postMessage({ command: 'loadConfig' });
        });

        btnAddProvider.addEventListener('click', () => {
            showProviderForm();
        });

        btnCreateFirst.addEventListener('click', () => {
            showProviderForm();
        });

        btnCancelForm.addEventListener('click', () => {
            formCard.classList.add('hidden');
        });

        btnCancelModelsModal.addEventListener('click', () => {
            modelsModal.classList.add('hidden');
        });

        // Form Submit
        providerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const indexVal = formIndex.value;
            const payload = {
                name: providerNameInput.value.trim(),
                url: providerUrlInput.value.trim(),
                apiKey: providerKeyInput.value.trim() || undefined,
                apiType: providerApiTypeSelect.value
            };

            vscode.postMessage({
                command: 'saveProvider',
                index: indexVal !== "" ? parseInt(indexVal, 10) : null,
                provider: payload
            });

            formCard.classList.add('hidden');
        });

        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'renderConfig':
                    providersData = message.config;
                    renderConfig(providersData);
                    rawJsonArea.value = JSON.stringify(providersData, null, 2);
                    break;
                case 'showFetchedModels':
                    showFetchedModelsModal(message.models, message.existingIds);
                    break;
                case 'hideLoader':
                    // Restore active button states
                    btnExecuteFetch.disabled = false;
                    btnExecuteFetch.innerText = 'Bắt đầu Fetch Models';
                    break;
            }
        });

        function showProviderForm(index = null) {
            formCard.classList.remove('hidden');
            fetchCard.classList.add('hidden');
            if (index !== null) {
                formTitle.innerText = "Sửa Endpoint: " + providersData[index].name;
                formIndex.value = index;
                providerNameInput.value = providersData[index].name;
                providerApiTypeSelect.value = providersData[index].apiType || 'chat-completions';
                providerKeyInput.value = providersData[index].apiKey || '';

                // Get URL from existing models if any
                let inferredUrl = '';
                const models = providersData[index].models || [];
                if (models.length > 0) {
                    inferredUrl = models[0].url
                        .replace(/\/chat\/completions\/?$/, '')
                        .replace(/\/messages\/?$/, '')
                        .replace(/\/responses\/?$/, '');
                }
                providerUrlInput.value = inferredUrl;
            } else {
                formTitle.innerText = "Thêm Endpoint Mới";
                formIndex.value = "";
                providerNameInput.value = "";
                providerUrlInput.value = "";
                providerKeyInput.value = "";
                providerApiTypeSelect.value = "chat-completions";
            }
        }

        function showFetchForm(name, url, apiType, apiKey) {
            fetchCard.classList.remove('hidden');
            formCard.classList.add('hidden');
            fetchProviderName.value = name;
            fetchBaseUrl.value = url;
            fetchApiType.value = apiType;
            fetchApiKeyInput.value = apiKey && !apiKey.startsWith('\${input:') ? apiKey : '';
        }

        btnExecuteFetch.addEventListener('click', () => {
            const key = fetchApiKeyInput.value.trim();
            const baseUrl = fetchBaseUrl.value;
            const provName = fetchProviderName.value;

            btnExecuteFetch.disabled = true;
            btnExecuteFetch.innerText = '⏳ Đang fetch models từ API...';

            vscode.postMessage({
                command: 'fetchModelsList',
                providerName: provName,
                baseUrl: baseUrl,
                apiKey: key,
                apiType: fetchApiType.value
            });
        });

        let fetchedModelsList = [];
        function showFetchedModelsModal(models, existingIds) {
            fetchedModelsList = models;
            modelsCheckboxList.innerHTML = '';

            if (models.length === 0) {
                modelsCheckboxList.innerHTML = '<p class="text-sm text-yellow-500">Không tìm thấy model nào từ endpoint.</p>';
                return;
            }

            models.forEach(m => {
                const isConfigured = existingIds.includes(m.id);
                const itemDiv = document.createElement('div');
                itemDiv.className = "flex items-center gap-2 p-1.5 hover:bg-gray-800 rounded transition-colors";
                itemDiv.innerHTML = \`
                    <input type="checkbox" id="chk_\${escapeHtml(m.id)}" value="\${escapeHtml(m.id)}" \${isConfigured ? 'checked' : ''} class="w-4 h-4 rounded">
                    <label for="chk_\${escapeHtml(m.id)}" class="flex-1 cursor-pointer">
                        <span class="font-semibold text-white">\${escapeHtml(m.id)}</span>
                        \${m.name && m.name !== m.id ? \`<span class="text-xs opacity-60 ml-2">(\${escapeHtml(m.name)})</span>\` : ''}
                        \${isConfigured ? '<span class="text-[10px] bg-green-900/40 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded ml-2">Đã cấu hình</span>' : ''}
                    </label>
                \`;
                modelsCheckboxList.appendChild(itemDiv);
            });

            modelsModal.classList.remove('hidden');
        }

        btnSaveFetchedModels.addEventListener('click', () => {
            const checkboxes = modelsCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
            const selectedIds = Array.from(checkboxes).map(cb => cb.value);

            if (selectedIds.length === 0) {
                vscode.postMessage({ command: 'showError', message: 'Vui lòng tích chọn ít nhất 1 model.' });
                return;
            }

            vscode.postMessage({
                command: 'saveFetchedModels',
                providerName: fetchProviderName.value,
                baseUrl: fetchBaseUrl.value,
                apiType: fetchApiType.value,
                apiKey: fetchApiKeyInput.value.trim() || undefined,
                selectedModelIds: selectedIds
            });

            modelsModal.classList.add('hidden');
            fetchCard.classList.add('hidden');
        });

        function renderConfig(config) {
            loader.classList.add('hidden');
            if (config.length === 0) {
                emptyState.classList.remove('hidden');
                providersList.innerHTML = '';
                return;
            }
            emptyState.classList.add('hidden');
            providersList.innerHTML = '';

            config.forEach((p, idx) => {
                const card = document.createElement('div');
                card.className = "p-6 rounded-lg border shadow-md space-y-4 transition-all";
                card.style.backgroundColor = "var(--card-bg)";
                card.style.borderColor = "var(--border-color)";

                // Extract Base URL
                let inferredUrl = '';
                if (p.models && p.models.length > 0) {
                    inferredUrl = p.models[0].url
                        .replace(/\/chat\/completions\/?$/, '')
                        .replace(/\/messages\/?$/, '')
                        .replace(/\/responses\/?$/, '');
                }

                const keyStatus = p.apiKey?.startsWith('\${input:') ? '🔒 Khóa Bảo Mật (Copilot Secret)' : '🔑 Văn bản thường (Plaintext)';

                let modelsRows = '';
                if (p.models && p.models.length > 0) {
                    p.models.forEach(m => {
                        modelsRows += \`
                        <tr class="border-b" style="border-color: var(--border-color)">
                            <td class="py-2 font-mono text-xs font-semibold text-white">\${escapeHtml(m.id)}</td>
                            <td class="py-2 text-xs">\${escapeHtml(m.name || m.id)}</td>
                            <td class="py-2 text-center text-xs">
                                \${m.toolCalling ? '✅' : '❌'}
                            </td>
                            <td class="py-2 text-center text-xs">
                                \${m.vision ? '✅' : '❌'}
                            </td>
                            <td class="py-2 text-center text-xs">
                                \${m.thinking ? '🧠' : '➖'}
                            </td>
                            <td class="py-2 text-right text-xs opacity-80 font-mono">\${m.maxInputTokens.toLocaleString()}</td>
                            <td class="py-2 text-right">
                                <button onclick="deleteModel(\${idx}, '\${escapeHtml(m.id)}')" class="text-red-500 hover:text-red-400 font-bold text-xs">Xoá</button>
                            </td>
                        </tr>\`;
                    });
                } else {
                    modelsRows = \`<tr><td colspan="7" class="py-4 text-center text-xs opacity-50">Chưa có models nào được cấu hình. Bấm "Fetch Models" bên dưới!</td></tr>\`;
                }

                card.innerHTML = \`
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="text-lg font-bold text-white flex items-center gap-2">
                                🌐 \${escapeHtml(p.name)}
                                <span class="text-xs font-normal bg-blue-900/50 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded">\${p.apiType || 'chat-completions'}</span>
                            </h3>
                            <p class="text-xs opacity-60 mt-1">Base URL: <span class="font-mono">\${escapeHtml(inferredUrl) || 'Chưa định nghĩa'}</span></p>
                            <p class="text-[10px] opacity-50">API Key: \${keyStatus}</p>
                        </div>
                        <div class="flex gap-1.5">
                            <button onclick="editProvider(\${idx})" class="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors">Sửa</button>
                            <button onclick="deleteProvider(\${idx})" class="px-3 py-1 text-xs rounded bg-red-950/50 hover:bg-red-900/60 text-red-400 border border-red-500/30 transition-colors">Xoá</button>
                        </div>
                    </div>

                    <!-- Models Table -->
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm">
                            <thead>
                                <tr class="border-b" style="border-color: var(--border-color)">
                                    <th class="pb-2 text-xs font-bold opacity-60">ID</th>
                                    <th class="pb-2 text-xs font-bold opacity-60">Hiển thị</th>
                                    <th class="pb-2 text-center text-xs font-bold opacity-60">Tools</th>
                                    <th class="pb-2 text-center text-xs font-bold opacity-60">Vision</th>
                                    <th class="pb-2 text-center text-xs font-bold opacity-60">Reasoning</th>
                                    <th class="pb-2 text-right text-xs font-bold opacity-60">Context</th>
                                    <th class="pb-2 text-right text-xs font-bold opacity-60">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${modelsRows}
                            </tbody>
                        </table>
                    </div>

                    <!-- Action footer -->
                    <div class="pt-2 flex justify-end">
                        <button onclick="triggerFetch(\${idx}, '\${p.name}', '\${inferredUrl}', '\${p.apiType || 'chat-completions'}', '\${p.apiKey || ''}')" class="px-4 py-2 text-xs rounded font-semibold text-white flex items-center gap-1" style="background-color: var(--button-bg)">
                            🔄 Fetch Models từ Endpoint này
                        </button>
                    </div>
                \`;
                providersList.appendChild(card);
            });
        }

        // Global functions called from HTML triggers
        window.editProvider = (idx) => {
            showProviderForm(idx);
        };

        window.deleteProvider = (idx) => {
            vscode.postMessage({ command: 'deleteProvider', index: idx });
        };

        window.deleteModel = (pIdx, modelId) => {
            vscode.postMessage({ command: 'deleteModel', providerIndex: pIdx, modelId: modelId });
        };

        window.triggerFetch = (idx, name, url, apiType, apiKey) => {
            showFetchForm(name, url, apiType, apiKey);
        };
    </script>
</body>
</html>`;
    }

    private async _handleMessage(message: any) {
        try {
            const configPath = getChatLanguageModelsPath(this.globalStorageUri);
            let configData = readChatLanguageModels(configPath);

            switch (message.command) {
                case 'loadConfig': {
                    this._panel.webview.postMessage({ command: 'renderConfig', config: configData });
                    break;
                }

                case 'saveProvider': {
                    const idx = message.index;
                    const p = message.provider;

                    // If existing provider is updated, keep existing models
                    let models: any[] = [];
                    let finalApiKey = p.apiKey;

                    if (idx !== null && idx >= 0 && idx < configData.length) {
                        models = configData[idx].models || [];
                        // If api key wasn't changed and is secure reference, preserve it
                        if (!finalApiKey && configData[idx].apiKey?.startsWith('${input:')) {
                            finalApiKey = configData[idx].apiKey;
                        }
                    }

                    const providerPayload: ProviderConfig = {
                        name: p.name,
                        vendor: 'customendpoint',
                        apiKey: finalApiKey || 'YOUR_API_KEY',
                        apiType: p.apiType,
                        models: models
                    };

                    // For each model in existing array, update its URL to match the new Base URL structure if it was updated
                    if (providerPayload.models && providerPayload.models.length > 0 && p.url) {
                        providerPayload.models = providerPayload.models.map((m: any) => {
                            const resolved = resolveModelConfig(m.id, p.url, p.apiType);
                            return {
                                ...m,
                                url: resolved.url,
                                apiType: resolved.apiType
                            };
                        });
                    }

                    if (idx !== null && idx >= 0 && idx < configData.length) {
                        configData[idx] = providerPayload;
                    } else {
                        configData.push(providerPayload);
                    }

                    writeChatLanguageModels(configPath, configData);
                    vscode.window.showInformationMessage(`Đã lưu nhà cung cấp "${p.name}" thành công!`);
                    this._panel.webview.postMessage({ command: 'renderConfig', config: configData });
                    break;
                }

                case 'deleteProvider': {
                    const idx = message.index;
                    if (idx >= 0 && idx < configData.length) {
                        const deletedName = configData[idx].name;
                        configData.splice(idx, 1);
                        writeChatLanguageModels(configPath, configData);
                        vscode.window.showInformationMessage(`Đã xóa nhà cung cấp "${deletedName}"!`);
                        this._panel.webview.postMessage({ command: 'renderConfig', config: configData });
                    }
                    break;
                }

                case 'deleteModel': {
                    const pIdx = message.providerIndex;
                    const modelId = message.modelId;
                    if (pIdx >= 0 && pIdx < configData.length) {
                        const provider = configData[pIdx];
                        if (provider.models) {
                            provider.models = provider.models.filter((m: any) => m.id !== modelId);
                            writeChatLanguageModels(configPath, configData);
                            vscode.window.showInformationMessage(`Đã xóa model "${modelId}"!`);
                            this._panel.webview.postMessage({ command: 'renderConfig', config: configData });
                        }
                    }
                    break;
                }

                case 'fetchModelsList': {
                    const { providerName, baseUrl, apiKey, apiType } = message;
                    try {
                        const fetched = await fetchModels(baseUrl, apiKey);
                        const existingProvider = configData.find(p => p.name === providerName && p.vendor === 'customendpoint');
                        const existingIds = existingProvider?.models?.map((m: any) => m.id) || [];

                        this._panel.webview.postMessage({
                            command: 'showFetchedModels',
                            models: fetched,
                            existingIds: existingIds
                        });
                    } catch (err) {
                        vscode.window.showErrorMessage(`Fetch models thất bại: ${err instanceof Error ? err.message : String(err)}`);
                    } finally {
                        this._panel.webview.postMessage({ command: 'hideLoader' });
                    }
                    break;
                }

                case 'saveFetchedModels': {
                    const { providerName, baseUrl, apiType, apiKey, selectedModelIds } = message;

                    const updatedConfig = mergeModelsIntoConfig(
                        configData,
                        providerName,
                        apiKey, // Will be written to file if provided
                        apiType,
                        baseUrl,
                        selectedModelIds
                    );

                    writeChatLanguageModels(configPath, updatedConfig);
                    vscode.window.showInformationMessage(`Đã cập nhật ${selectedModelIds.length} models cho "${providerName}" vào chatLanguageModels.json!`);
                    this._panel.webview.postMessage({ command: 'renderConfig', config: updatedConfig });
                    break;
                }

                case 'showError': {
                    vscode.window.showErrorMessage(message.message);
                    break;
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Đã xảy ra lỗi: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
