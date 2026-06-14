import { redirect } from "next/navigation";

export default function LegacyUsersSettingsRedirectPage() {
  redirect("/settings");
}
