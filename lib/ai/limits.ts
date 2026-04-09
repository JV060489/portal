export const AI_MESSAGE_LIMIT = 20;

const POWER_USER_LIMITS_BY_EMAIL: Record<string, number> = {
  "vasanthjanarthanan@gmail.com": 1000,
};

export function getAiMessageLimit(email?: string | null) {
  if (!email) return AI_MESSAGE_LIMIT;
  return POWER_USER_LIMITS_BY_EMAIL[email.toLowerCase()] ?? AI_MESSAGE_LIMIT;
}

export function buildAiMessageLimitError(limit = AI_MESSAGE_LIMIT) {
  return `You have reached the ${limit}-message limit for AI chat across all models.`;
}
