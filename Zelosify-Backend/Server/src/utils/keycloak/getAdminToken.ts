import axios from "axios";

export async function getAdminToken() {
  try {
    console.log("🔹 Attempting to get admin token from Keycloak...");
    const response = await axios.post(
      `${process.env.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: process.env.KEYCLOAK_ADMIN || "admin",
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || "admin",
        scope: "openid",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    console.log("✅ Admin token obtained successfully");
    return response.data.access_token;
  } catch (error) {
    console.error("❌ Error getting admin token:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Status code:", error.response?.status);
    }
    throw error;
  }
}
