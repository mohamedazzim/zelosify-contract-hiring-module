import axios from "axios";

export async function createKeycloakUser(adminToken: string, userData: any) {
  try {
    console.log("🔹 Creating user in Keycloak...");
    const response = await axios.post(
      `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users`,
      {
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        enabled: true,
        credentials: userData.credentials,
        requiredActions: [], // No required actions for now
        emailVerified: true,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Get the user ID from the location header
    const locationHeader = response.headers.location;
    if (!locationHeader) {
      throw new Error("User created but no location header returned");
    }
    const userId = locationHeader.split("/").pop();
    console.log("✅ User created in Keycloak with ID:", userId);
    return { id: userId };
  } catch (error) {
    console.error("❌ Error creating Keycloak user:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Status code:", error.response?.status);
    }
    throw error;
  }
}
