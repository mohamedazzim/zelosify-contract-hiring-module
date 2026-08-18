import axios from "axios";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080/auth";
const REALM_NAME = process.env.KEYCLOAK_REALM || "Zelosify";
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "dynamic-client";
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";

let cachedClientSecret: string | null = null;
let clientSecretExpiry: number = 0;
const CLIENT_SECRET_TTL = 3600 * 1000; // 1 hour

export async function getKeycloakClientSecret(): Promise<string> {
  try {
    // Return cached secret if valid
    if (cachedClientSecret && Date.now() < clientSecretExpiry) {
      return cachedClientSecret;
    }

    // Get admin token
    const tokenResponse = await axios.post(
      `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      }
    );

    const adminToken = tokenResponse.data.access_token;

    // Get client secret
    const clientResponse = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        params: { clientId: CLIENT_ID },
        timeout: 5000,
      }
    );

    const client = clientResponse.data[0];
    if (!client) {
      throw new Error(`Client ${CLIENT_ID} not found in realm ${REALM_NAME}`);
    }

    const secretResponse = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${client.id}/client-secret`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: 5000,
      }
    );

    if (!secretResponse.data.value) {
      throw new Error("Client secret not found in response");
    }

    cachedClientSecret = secretResponse.data.value;
    clientSecretExpiry = Date.now() + CLIENT_SECRET_TTL;

    return secretResponse.data.value;
  } catch (error) {
    console.error("Failed to retrieve Keycloak client secret:", error);
    throw new Error("Failed to retrieve Keycloak client secret");
  }
}
