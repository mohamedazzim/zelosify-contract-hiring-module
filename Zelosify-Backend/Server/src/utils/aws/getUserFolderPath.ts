export const getUserFolderPath = (
  pathPrefix: string,
  tenantId: string,
  department: string,
  userId: string
): string => {
  // Validate the user object and ensure all required properties exist
  if (!pathPrefix || !userId || !tenantId || !department) {
    throw new Error("User information is incomplete or missing");
  }

  // Normalize the  department to lowercase
  const normalizedDepartment = department.toLowerCase();

  const baseFolderPath = `${pathPrefix}/${tenantId}/${normalizedDepartment}`;

  // Construct the full folder path for the specific user
  return `${baseFolderPath}/${userId}`;
};
