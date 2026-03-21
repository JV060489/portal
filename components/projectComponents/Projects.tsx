"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ProjectTree, type ProjectTreeHandle } from "./ProjectTree";

export default function Projects() {
  const [collapsed, setCollapsed] = useState(false);
  const treeRef = useRef<ProjectTreeHandle>(null);

  return (
    <aside
      className={`
        h-full bg-neutral-950 border-r border-white/5 flex flex-col shrink-0
        transition-all duration-300 ease-in-out overflow-hidden scrollbar-hide relative z-10
        ${collapsed ? "w-12" : "w-64"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/5 scrollbar-hide">
        {!collapsed && (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Projects
          </h2>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
              onClick={() => treeRef.current?.startCreatingProject()}
              title="New Project"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-auto py-2 scrollbar-hide ${collapsed ? "hidden" : ""}`}>
        <ProjectTree ref={treeRef} />
      </div>

      {/* Collapsed icons */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
              />
            </svg>
          </div>
        </div>
      )}
    </aside>
  );
}
