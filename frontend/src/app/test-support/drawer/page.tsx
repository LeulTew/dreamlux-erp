import { notFound } from "next/navigation";
import DrawerLifecycleFixture from "./DrawerLifecycleFixture";

export default function DrawerTestSupportPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DrawerLifecycleFixture />;
}
