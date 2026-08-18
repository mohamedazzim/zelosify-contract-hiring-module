// Properly format the public key for JWT verification
export const formatPublicKey = (
  key: string | undefined
): string | undefined => {
  if (!key) return undefined;

  // Check if the key already has PEM markers
  if (key.includes("-----BEGIN PUBLIC KEY-----")) {
    return key;
  }

  // Add proper PEM format with newlines
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
};
