export interface FetchedModel {
    id: string;
    name?: string;
}

export interface ModelConfig {
    id: string;
    name: string;
    url: string;
    toolCalling: boolean;
    vision: boolean;
    maxInputTokens: number;
    maxOutputTokens: number;
    thinking?: boolean;
    apiType?: string;
}

/**
 * Fetches the list of models from an OpenAI-compatible /models endpoint.
 */
export async function fetchModels(baseUrl: string, apiKey?: string): Promise<FetchedModel[]> {
    // Standardize Base URL. If it doesn't have an HTTP protocol, prepend it.
    let cleanUrl = baseUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
    }

    // Strip trailing slashes, /chat/completions, /models, etc. to get the root/v1 base URL
    cleanUrl = cleanUrl
        .replace(/\/chat\/completions\/?$/, '')
        .replace(/\/models\/?$/, '')
        .replace(/\/+$/, '');

    const modelsEndpoint = `${cleanUrl}/models`;

    const headers: Record<string, string> = {
        'Accept': 'application/json',
    };

    if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    try {
        const response = await fetch(modelsEndpoint, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`HTTP error ${response.status}: ${errText || response.statusText}`);
        }

        const data = await response.json() as any;

        let rawModels: any[] = [];
        if (data && Array.isArray(data)) {
            rawModels = data;
        } else if (data && Array.isArray(data.data)) {
            rawModels = data.data;
        } else if (data && typeof data === 'object') {
            // Some non-standard APIs might wrap models in another key or format
            const keys = Object.keys(data);
            for (const key of keys) {
                if (Array.isArray(data[key])) {
                    rawModels = data[key];
                    break;
                }
            }
        }

        // Map models to FetchedModel objects
        const models: FetchedModel[] = rawModels
            .filter(m => m && typeof m === 'object' && typeof m.id === 'string')
            .map(m => ({
                id: m.id,
                name: typeof m.name === 'string' ? m.name : m.id
            }));

        if (models.length === 0) {
            throw new Error('No models found in the API response.');
        }

        return models;
    } catch (error) {
        console.error('Failed to fetch models:', error);
        throw new Error(`Failed to fetch models from ${modelsEndpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Resolves smart default configuration properties for a given model ID.
 */
export function resolveModelConfig(
    modelId: string,
    baseUrl: string,
    apiType: string = 'chat-completions'
): ModelConfig {
    const idLower = modelId.toLowerCase();

    // Default fallback values
    let name = modelId;
    let maxInputTokens = 32768;
    let maxOutputTokens = 4096;
    let vision = false;
    let toolCalling = true;
    let thinking = false;

    // Smart vision detection
    if (
        idLower.includes('vision') ||
        idLower.includes('vl') ||
        idLower.includes('multimodal') ||
        idLower.includes('gpt-4o') ||
        idLower.includes('claude-3-5') ||
        idLower.includes('claude-3.5') ||
        idLower.includes('gemini') ||
        idLower.includes('pixtral') ||
        idLower.includes('minicpm')
    ) {
        vision = true;
    }

    // Smart thinking/reasoning detection
    if (
        idLower.includes('reasoner') ||
        idLower.includes('reasoning') ||
        idLower.includes('thinking') ||
        idLower.includes('-r') ||
        idLower.startsWith('r-') ||
        idLower.includes('deepseek-r1') ||
        idLower.includes('o1-') ||
        idLower.includes('o3-') ||
        idLower.includes('qwq')
    ) {
        thinking = true;
    }

    // Specific popular model overrides
    if (idLower.includes('deepseek-chat') || idLower.includes('deepseek-coder')) {
        name = idLower.includes('chat') ? 'DeepSeek Chat' : 'DeepSeek Coder';
        maxInputTokens = 64000;
        maxOutputTokens = 4096;
    } else if (idLower.includes('deepseek-reasoner') || idLower.includes('deepseek-r1')) {
        name = 'DeepSeek R1 (Reasoner)';
        maxInputTokens = 64000;
        maxOutputTokens = 8192;
        thinking = true;
    } else if (idLower.includes('gpt-4o-mini')) {
        name = 'GPT-4o Mini';
        maxInputTokens = 120000;
        maxOutputTokens = 8192;
    } else if (idLower.includes('gpt-4o')) {
        name = 'GPT-4o';
        maxInputTokens = 120000;
        maxOutputTokens = 16384;
    } else if (idLower.includes('claude-3-5-sonnet') || idLower.includes('claude-3.5-sonnet')) {
        name = 'Claude 3.5 Sonnet';
        maxInputTokens = 190000;
        maxOutputTokens = 8192;
    } else if (idLower.includes('claude-3-5-haiku') || idLower.includes('claude-3.5-haiku')) {
        name = 'Claude 3.5 Haiku';
        maxInputTokens = 190000;
        maxOutputTokens = 8192;
    } else if (idLower.includes('gemini-1.5-pro') || idLower.includes('gemini-2.0-pro')) {
        name = idLower.includes('1.5') ? 'Gemini 1.5 Pro' : 'Gemini 2.0 Pro';
        maxInputTokens = 200000;
        maxOutputTokens = 8192;
    } else if (idLower.includes('gemini-1.5-flash') || idLower.includes('gemini-2.0-flash')) {
        name = idLower.includes('1.5') ? 'Gemini 1.5 Flash' : 'Gemini 2.0 Flash';
        maxInputTokens = 200000;
        maxOutputTokens = 8192;
    } else if (idLower.includes('llama-3.1-8b') || idLower.includes('llama-3-8b')) {
        name = 'Llama 3 8B';
        maxInputTokens = 32768;
    } else if (idLower.includes('llama-3.1-70b') || idLower.includes('llama-3-70b')) {
        name = 'Llama 3 70B';
        maxInputTokens = 64000;
    } else if (idLower.includes('llama-3.1-405b')) {
        name = 'Llama 3.1 405B';
        maxInputTokens = 120000;
    } else if (idLower.includes('qwen')) {
        if (idLower.includes('coder')) {
            name = 'Qwen Coder';
        } else {
            name = 'Qwen';
        }
        maxInputTokens = 32768;
    }

    // Construct the completions endpoint URL.
    // In chatLanguageModels.json for customendpoint, the URL property must point to the actual completions path.
    let cleanUrl = baseUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'https://' + cleanUrl;
    }
    // Strip trailing slashes, /chat/completions, /models, etc.
    cleanUrl = cleanUrl
        .replace(/\/chat\/completions\/?$/, '')
        .replace(/\/models\/?$/, '')
        .replace(/\/+$/, '');

    let modelUrl = '';
    if (apiType === 'messages') {
        modelUrl = `${cleanUrl}/messages`;
    } else if (apiType === 'responses') {
        modelUrl = `${cleanUrl}/responses`;
    } else {
        // Default to chat-completions
        modelUrl = `${cleanUrl}/chat/completions`;
    }

    return {
        id: modelId,
        name: name,
        url: modelUrl,
        toolCalling: toolCalling,
        vision: vision,
        maxInputTokens: maxInputTokens,
        maxOutputTokens: maxOutputTokens,
        thinking: thinking ? true : undefined,
        apiType: apiType
    };
}
