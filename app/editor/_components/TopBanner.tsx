"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

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
      <button
        onClick={handleSignOut}
        className="rounded-md bg-neutral-800 px-3 py-1 text-sm text-neutral-300 transition-colors
        border-red-400 hover:bg-neutral-700 cursor-pointer"
      >
        Logout
      </button>
    </div>
  );
}
