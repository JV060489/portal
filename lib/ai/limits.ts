export const AI_MESSAGE_LIMIT = 20;

export function buildAiMessageLimitError(limit = AI_MESSAGE_LIMIT) {
  return `You have reached the ${limit}-message limit for AI chat across all models.`;
}
