import { resolveModelConfig, ModelConfig } from './apiClient';

export interface ProviderConfig {
    name: string;
    vendor: string;
    apiKey?: string;
    apiType?: string;
    models?: ModelConfig[];
}

/**
 * Merges selected model IDs into the provider config in the global array.
 * If the provider doesn't exist, a new one is created.
 */
export function mergeModelsIntoConfig(
    existingConfig: ProviderConfig[],
    providerName: string,
    providerApiKey: string | undefined,
    providerApiType: string,
    baseUrl: string,
    selectedModelIds: string[]
): ProviderConfig[] {
    const updatedConfig = [...existingConfig];

    // Find if provider already exists (by name and vendor === "customendpoint")
    let providerIndex = updatedConfig.findIndex(
        p => p.vendor === 'customendpoint' && p.name.toLowerCase() === providerName.toLowerCase()
    );

    let provider: ProviderConfig;

    if (providerIndex >= 0) {
        // Use existing provider
        provider = { ...updatedConfig[providerIndex] };
        // Update its apiType and apiKey if provided
        provider.apiType = providerApiType;
        if (providerApiKey !== undefined) {
            provider.apiKey = providerApiKey;
        }
    } else {
        // Create a new provider
        provider = {
            name: providerName,
            vendor: 'customendpoint',
            apiKey: providerApiKey || 'YOUR_API_KEY',
            apiType: providerApiType,
            models: []
        };
    }

    if (!provider.models) {
        provider.models = [];
    }

    // Generate model configurations for all selected model IDs
    const resolvedModels = selectedModelIds.map(id => resolveModelConfig(id, baseUrl, providerApiType));

    // Merge logic:
    // For each resolved model, if it already exists, merge fields but preserve user-customized token limits if possible.
    // If it doesn't exist, append it.
    const mergedModels: ModelConfig[] = [...provider.models];

    for (const newModel of resolvedModels) {
        const existingModelIndex = mergedModels.findIndex(m => m.id === newModel.id);
        if (existingModelIndex >= 0) {
            // Merge: update URL and essential capabilities, but keep existing custom limits if they are defined
            const existingModel = mergedModels[existingModelIndex];
            mergedModels[existingModelIndex] = {
                ...newModel,
                // Preserve custom limits if the user has already tweaked them
                maxInputTokens: existingModel.maxInputTokens !== undefined ? existingModel.maxInputTokens : newModel.maxInputTokens,
                maxOutputTokens: existingModel.maxOutputTokens !== undefined ? existingModel.maxOutputTokens : newModel.maxOutputTokens,
                name: existingModel.name || newModel.name,
                toolCalling: existingModel.toolCalling !== undefined ? existingModel.toolCalling : newModel.toolCalling,
                vision: existingModel.vision !== undefined ? existingModel.vision : newModel.vision,
            };
        } else {
            mergedModels.push(newModel);
        }
    }

    provider.models = mergedModels;

    if (providerIndex >= 0) {
        updatedConfig[providerIndex] = provider;
    } else {
        updatedConfig.push(provider);
    }

    return updatedConfig;
}
