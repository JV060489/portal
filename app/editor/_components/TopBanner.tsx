"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function TopBanner() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      <span className="text-sm text-neutral-300">
        {isPending
          ? "Loading..."
          : `Welcome, ${session?.user?.username ?? "User"}`}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSignOut}
        className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 h-7 text-xs"
      >
        Logout
      </Button>
    </div>
  );
}
