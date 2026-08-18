import crypto from "crypto";

// Encryption and Decryption Keys (store securely in environment variables)
const ALGORITHM = process.env.ENCRYPTION_ALGORITHM!;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32 bytes key

// Encrypt function
export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  ) as crypto.CipherGCM;
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

// Decrypt function
export const decrypt = (encryptedText: string): string => {
  const [ivHex, authTagHex, encryptedData] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  ) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};
