"use client";

import { useState } from "react";
import { Tree, NodeRendererProps } from "react-arborist";

type TreeNode = {
  id: string;
  name: string;
  children?: TreeNode[];
};

const initialData: TreeNode[] = [
  {
    id: "project-1",
    name: "Untitled Project",
    children: [
      { id: "scene-1-1", name: "Main Scene" },
      { id: "scene-1-2", name: "Interior" },
      { id: "scene-1-3", name: "Exterior" },
    ],
  },
  {
    id: "project-2",
    name: "Product Showcase",
    children: [
      { id: "scene-2-1", name: "Hero Shot" },
      { id: "scene-2-2", name: "Detail View" },
    ],
  },
  {
    id: "project-3",
    name: "Architecture Viz",
    children: [
      { id: "scene-3-1", name: "Lobby" },
      { id: "scene-3-2", name: "Rooftop" },
      { id: "scene-3-3", name: "Courtyard" },
      { id: "scene-3-4", name: "Parking" },
    ],
  },
];

function Node({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const isProject = node.isInternal;
  const isSelected = node.isSelected;

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`
        flex items-center gap-2 px-3 py-1.5 mx-2 my-0.5 rounded-lg cursor-pointer select-none
        transition-all duration-150
        ${isSelected ? "bg-blue-500/15 text-blue-400" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"}
      `}
      onClick={() => {
        if (node.isInternal) node.toggle();
        else node.select();
      }}
    >
      {isProject ? (
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${node.isOpen ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 shrink-0 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      )}
      <span className={`text-sm truncate ${isProject ? "font-medium" : "font-normal"}`}>
        {node.data.name}
      </span>
    </div>
  );
}

export default function Projects() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`
        h-full bg-neutral-950 border-r border-white/5 flex flex-col
        transition-all duration-300 ease-in-out overflow-hidden
        ${collapsed ? "w-12" : "w-64"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
        {!collapsed && (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Projects
          </h2>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-colors cursor-pointer"
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Tree */}
      {!collapsed && (
        <div className="flex-1 overflow-auto py-2">
          <Tree<TreeNode>
            data={initialData}
            openByDefault={true}
            width="100%"
            indent={20}
            rowHeight={32}
            paddingBottom={16}
          >
            {Node}
          </Tree>
        </div>
      )}

      {/* Collapsed icons */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
        </div>
      )}
    </aside>
  );
}
