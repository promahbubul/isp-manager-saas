import { redirect } from "next/navigation";

/** Demo booking was removed — send old links to the free trial. */
export default function DemoRedirect() {
  redirect("/signup");
}
