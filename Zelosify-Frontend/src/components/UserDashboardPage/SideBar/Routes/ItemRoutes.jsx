import {
  LogOut,
  Settings,
  CreditCard,
  Headset,
  Smile,
  Scale3DIcon,
  Frown,
} from "lucide-react";
import { MdDataUsage } from "react-icons/md";

// Role-based menu items
const getOverviewItemsByRole = (role) => {
  switch (role) {
    // For VENDOR_MANAGER role
    case "VENDOR_MANAGER":
      return [
        {
          title: "Smile",
          href: "#",
          icon: Smile,
          hasSubmenu: true,
          submenu: [{ title: "Sad", href: "/user", icon: Frown }],
        },
      ];

    // For BUSINESS_USER role
    case "BUSINESS_USER":
      return [
        {
          title: "Digital",
          href: "/business-user/digital-initiative",
          icon: MdDataUsage,
        },
        {
          title: "Dummy Page 1",
          href: "/business-user/dummy-page-1",
          icon: Scale3DIcon,
        },
      ];

    // For IT_VENDOR
    case "IT_VENDOR":
      return [
        { title: "Payments", href: "/vendor/payments", icon: CreditCard },
      ];

    default:
      return [];
  }
};

// Role-based sidebar sections
export const getSidebarSectionsByRole = (role) => {
  const overviewItems = getOverviewItemsByRole(role);

  if (overviewItems.length === 0) {
    return [];
  }

  return [
    {
      title: "Overview",
      items: overviewItems,
    },
  ];
};

export const supportItem = {
  title: "Support",
  href: "/user/support",
  icon: Headset,
};

export const settingsItem = {
  title: "Settings",
  href: "/user/settings",
  icon: Settings,
};
export const signOutItem = { title: "Sign Out", href: "#", icon: LogOut };
