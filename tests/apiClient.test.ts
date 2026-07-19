import { fetchModels, resolveModelConfig } from '../src/apiClient';

describe('apiClient tests', () => {
    describe('resolveModelConfig', () => {
        test('resolves deepseek-chat with smart parameters', () => {
            const config = resolveModelConfig('deepseek-chat', 'https://api.deepseek.com/v1');
            expect(config.name).toBe('DeepSeek Chat');
            expect(config.maxInputTokens).toBe(64000);
            expect(config.toolCalling).toBe(true);
            expect(config.vision).toBe(false);
            expect(config.thinking).toBeUndefined();
            expect(config.url).toBe('https://api.deepseek.com/v1/chat/completions');
        });

        test('resolves deepseek-reasoner with thinking/reasoning parameters', () => {
            const config = resolveModelConfig('deepseek-reasoner', 'https://api.deepseek.com/v1');
            expect(config.name).toBe('DeepSeek R1 (Reasoner)');
            expect(config.maxInputTokens).toBe(64000);
            expect(config.thinking).toBe(true);
            expect(config.url).toBe('https://api.deepseek.com/v1/chat/completions');
        });

        test('resolves gpt-4o with vision parameters', () => {
            const config = resolveModelConfig('gpt-4o', 'https://api.openai.com/v1');
            expect(config.name).toBe('GPT-4o');
            expect(config.vision).toBe(true);
            expect(config.url).toBe('https://api.openai.com/v1/chat/completions');
        });

        test('resolves Claude 3.5 Sonnet with messages API type', () => {
            const config = resolveModelConfig('claude-3-5-sonnet-20241022', 'https://api.anthropic.com/v1', 'messages');
            expect(config.name).toBe('Claude 3.5 Sonnet');
            expect(config.vision).toBe(true);
            expect(config.apiType).toBe('messages');
            expect(config.url).toBe('https://api.anthropic.com/v1/messages');
        });
    });

    describe('fetchModels', () => {
        let originalFetch: typeof fetch;

        beforeAll(() => {
            originalFetch = global.fetch;
        });

        afterAll(() => {
            global.fetch = originalFetch;
        });

        test('fetches models list successfully from OpenAI format', async () => {
            const mockResponse = {
                data: [
                    { id: 'model-a', object: 'model' },
                    { id: 'model-b', object: 'model' }
                ]
            };

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            } as any);

            const models = await fetchModels('https://api.example.com/v1', 'test-key');

            expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/v1/models', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer test-key'
                }
            });
            expect(models).toEqual([
                { id: 'model-a', name: 'model-a' },
                { id: 'model-b', name: 'model-b' }
            ]);
        });

        test('handles error response correctly', async () => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => 'Invalid key'
            } as any);

            await expect(fetchModels('https://api.example.com/v1', 'bad-key'))
                .rejects.toThrow('HTTP error 401: Invalid key');
        });
    });
});
