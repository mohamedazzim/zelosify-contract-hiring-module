import KeycloakConnect from "keycloak-connect";
import session from "express-session";
import axios from "axios";

// Environment variables and constants
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080/auth";
const REALM_NAME = process.env.KEYCLOAK_REALM || "Zelosify";
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "dynamic-client";
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;

// Cache settings
const memoryStore = new session.MemoryStore();
let keycloakInstance: KeycloakConnect.Keycloak | null = null;

// Setup Keycloak configuration
export async function setupKeycloakConfig() {
  try {
    if (keycloakInstance) {
      return { keycloak: keycloakInstance, memoryStore };
    }

    const keycloakConfig = {
      realm: REALM_NAME,
      "auth-server-url": KEYCLOAK_URL,
      "ssl-required":
        process.env.NODE_ENV === "production" ? "external" : "none",
      resource: CLIENT_ID,
      "confidential-port": 0,
      "verify-token-audience": false,
      "use-resource-role-mappings": true,
      "bearer-only": false,
      "public-client": false,
      credentials: {
        secret: CLIENT_SECRET,
      },
      // Performance optimizations
      "minimum-time-between-jwks-requests": 60, // Cache JWKS for 1 minute
      "connection-pool-size": 5,
      "connection-pool-min-idle": 1,
      // "socket-timeout": 5000, // 5 seconds
      // "connection-timeout": 5000, // 5 seconds
      // "read-timeout": 5000, // 5 seconds
    };

    keycloakInstance = new KeycloakConnect(
      { store: memoryStore },
      keycloakConfig
    );

    // Initialize Keycloak with optimized settings
    keycloakInstance.accessDenied = (req, res) => {
      res.status(403).json({
        error: "Access Denied",
        message: "You do not have permission to access this resource",
      });
    };

    // Test the connection
    try {
      await axios.get(
        `${KEYCLOAK_URL}/realms/${REALM_NAME}/.well-known/openid-configuration`
      );
      console.log("✅ Connected to Keycloak Server");
    } catch (error) {
      console.error("❌ Failed to connect to Keycloak server:", error);
      throw new Error("Failed to connect to Keycloak server");
    }

    return { keycloak: keycloakInstance, memoryStore };
  } catch (error) {
    console.error("❌ Error setting up Keycloak:", error);
    throw error;
  }
}

// Get client secret with caching
let cachedClientSecret: string | null = null;
let clientSecretExpiry = 0;
const CLIENT_SECRET_TTL = 3600 * 1000; // 1 hour

export async function getClientSecret(adminToken: string): Promise<string> {
  try {
    if (cachedClientSecret && Date.now() < clientSecretExpiry) {
      return cachedClientSecret;
    }

    const response = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        // timeout: 5000,
      }
    );

    const client = response.data.find((c: any) => c.clientId === CLIENT_ID);
    if (!client) {
      throw new Error(`Client ${CLIENT_ID} not found in realm ${REALM_NAME}`);
    }

    const secretResponse = await axios.get(
      `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${client.id}/client-secret`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        // timeout: 5000,
      }
    );

    if (!secretResponse.data.value) {
      throw new Error("Client secret not found in response");
    }

    const newClientSecret: string = secretResponse.data.value;
    cachedClientSecret = newClientSecret;
    clientSecretExpiry = Date.now() + CLIENT_SECRET_TTL;

    return newClientSecret;
  } catch (error) {
    console.error("❌ Failed to fetch client secret:", error);
    throw error;
  }
}
