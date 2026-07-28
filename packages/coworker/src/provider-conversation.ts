export interface ProviderConversationIdentity {
  provider: string;
  providerAccountId: string;
  providerConversationId: string;
}

export function normalizeProviderConversationIdentity(
  input: ProviderConversationIdentity,
): ProviderConversationIdentity {
  const provider = input.provider.trim();
  const providerAccountId = input.providerAccountId.trim();
  const providerConversationId = input.providerConversationId.trim();
  if (!provider || !providerAccountId || !providerConversationId) {
    throw new Error("Provider, provider account, and provider conversation are required");
  }
  return { provider, providerAccountId, providerConversationId };
}
