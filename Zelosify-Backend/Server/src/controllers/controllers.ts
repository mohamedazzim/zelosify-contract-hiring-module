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
} from "./vendor/resourceRequest/vendorRequestController.js";

// Vendor opening management (IT Vendor)
export {
  getOpenings,
  getOpeningById,
  presignUploadUrl,
  uploadProfile,
  deleteProfile,
  previewProfile,
} from "./vendor/openings/vendorOpeningsController.js";

// ===== HIRING MANAGEMENT =====
export {
  getManagerOpenings,
  getOpeningProfiles,
  shortlistProfile,
  rejectProfile,
} from "./hiring/hiringProfileController.js";
