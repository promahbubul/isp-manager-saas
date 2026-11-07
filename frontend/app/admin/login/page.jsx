import { redirect } from "next/navigation";

/** Old link — everyone now logs in on /login. */
export default function AdminLoginRedirect() {
  redirect("/login");
}
