"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TopBanner() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Show back button when inside a scene page: /projects/[projectId]/[sceneId]
  const isScenePage = /^\/projects\/[^/]+\/[^/]+$/.test(pathname);

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <div className="flex items-center justify-between border-b px-4 py-2">
      <div className="flex items-center gap-2">
        {isScenePage && (
          <button
            onClick={() => router.push("/projects")}
            className="flex items-center justify-center rounded p-1 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
            aria-label="Back to projects"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
        <span className="text-sm text-neutral-300">
          {isPending
            ? "Loading..."
            : `Welcome, ${session?.user?.username ?? "User"}`}
        </span>
      </div>
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
