import type { Metadata } from "next";
import { Settings } from "@/features/account";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your account, how your goals are stored, and the MCP endpoint agents connect to.",
};

export default function SettingsPage() {
  return <Settings />;
}
