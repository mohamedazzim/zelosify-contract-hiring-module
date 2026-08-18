// ===== Local AUTH =====
export {
  register,
  verifyLogin,
  verifyTOTP,
} from "./auth/local/localAuthController.js";

// ===== Unified AUTH Logout =====
export { logout } from "./auth/logout(unified)/logout.js";

// ===== User details retrieval =====
export { getUserDetails } from "./auth/user/getUserDetails.js";

// ===== STORAGE =====
export { listOfObjects } from "./storage/storageController.js";

// ===== FORM =====
export { createDigitalInitiative } from "./form/initiativeRequestController.js";

// ===== VENDOR MANAGEMENT =====
// Vendor resource requests
export {
  fetchRequestData,
  //   updateVendorRequest,
  //   generatePresignedUrls,
  //   uploadAttachment,
  //   // deleteAttachment,
} from "./vendor/resourceRequest/vendorRequestController.js";

// ===== HIRING MANAGEMENT =====
export { fetchData } from "./hiring/hiringProfileController.js";
