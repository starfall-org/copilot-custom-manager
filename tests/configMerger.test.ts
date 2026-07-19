import { mergeModelsIntoConfig, ProviderConfig } from '../src/configMerger';

describe('configMerger tests', () => {
    test('creates new provider if it does not exist', () => {
        const existingConfig: ProviderConfig[] = [];
        const result = mergeModelsIntoConfig(
            existingConfig,
            'DeepSeek',
            'sk-123',
            'chat-completions',
            'https://api.deepseek.com/v1',
            ['deepseek-chat']
        );

        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            name: 'DeepSeek',
            vendor: 'customendpoint',
            apiKey: 'sk-123',
            apiType: 'chat-completions',
            models: [
                {
                    id: 'deepseek-chat',
                    name: 'DeepSeek Chat',
                    url: 'https://api.deepseek.com/v1/chat/completions',
                    toolCalling: true,
                    vision: false,
                    maxInputTokens: 64000,
                    maxOutputTokens: 4096,
                    apiType: 'chat-completions'
                }
            ]
        });
    });

    test('updates existing provider and merges new models', () => {
        const existingConfig: ProviderConfig[] = [
            {
                name: 'DeepSeek',
                vendor: 'customendpoint',
                apiKey: 'sk-old',
                apiType: 'chat-completions',
                models: [
                    {
                        id: 'deepseek-chat',
                        name: 'My Custom DeepSeek Chat Name',
                        url: 'https://api.deepseek.com/v1/chat/completions',
                        toolCalling: true,
                        vision: false,
                        maxInputTokens: 80000, // custom limit
                        maxOutputTokens: 8192 // custom limit
                    }
                ]
            }
        ];

        const result = mergeModelsIntoConfig(
            existingConfig,
            'DeepSeek',
            'sk-new', // updated key
            'chat-completions',
            'https://api.deepseek.com/v1',
            ['deepseek-chat', 'deepseek-reasoner'] // added deepseek-reasoner
        );

        expect(result.length).toBe(1);
        const provider = result[0];
        expect(provider.apiKey).toBe('sk-new');
        expect(provider.models?.length).toBe(2);

        // deepseek-chat should preserve custom limits and name
        const chatModel = provider.models?.find(m => m.id === 'deepseek-chat');
        expect(chatModel).toBeDefined();
        expect(chatModel?.name).toBe('My Custom DeepSeek Chat Name');
        expect(chatModel?.maxInputTokens).toBe(80000);
        expect(chatModel?.maxOutputTokens).toBe(8192);

        // deepseek-reasoner should be newly added with default config
        const reasonerModel = provider.models?.find(m => m.id === 'deepseek-reasoner');
        expect(reasonerModel).toBeDefined();
        expect(reasonerModel?.name).toBe('DeepSeek R1 (Reasoner)');
        expect(reasonerModel?.maxInputTokens).toBe(64000);
        expect(reasonerModel?.thinking).toBe(true);
    });
});
