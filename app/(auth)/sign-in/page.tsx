import SignInForm from "@/features/auth/components/signin-form";
import { requireUnAuth } from "@/lib/auth-utils";

export default async function Page() {
  await requireUnAuth();

  return (
    <>
      <SignInForm />
    </>
  );
}
