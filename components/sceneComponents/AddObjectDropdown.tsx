"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SHAPES } from "@/lib/yjs/types";
import { useYjsAddObject } from "@/lib/yjs/hooks";

export function AddObjectDropdown() {
  const addObject = useYjsAddObject();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent"
          title="Add Object"
          aria-label="Add Object"
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
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="bg-popover border-border min-w-40 z-50"
        align="start"
      >
        {SHAPES.map((shape) => (
          <DropdownMenuItem
            key={shape.geometry}
            className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
            onClick={() => addObject(shape.geometry, shape.defaultName)}
          >
            <ShapeIcon geometry={shape.geometry} />
            <span className="ml-2">{shape.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShapeIcon({ geometry }: { geometry: string }) {
  const cls = "w-4 h-4 shrink-0";
  switch (geometry) {
    case "box":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      );
    case "sphere":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="9" ry="4" />
        </svg>
      );
    case "cylinder":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <ellipse cx="12" cy="5" rx="7" ry="3" />
          <ellipse cx="12" cy="19" rx="7" ry="3" />
          <path d="M5 5v14M19 5v14" />
        </svg>
      );
    case "cone":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 3L5 19M12 3l7 16" />
          <ellipse cx="12" cy="19" rx="7" ry="3" />
        </svg>
      );
    case "torus":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <ellipse cx="12" cy="12" rx="10" ry="4" />
          <ellipse cx="12" cy="12" rx="4" ry="1.5" />
        </svg>
      );
    case "plane":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3 17l6-4 6 4 6-4" />
          <path d="M3 13l6-4 6 4 6-4" />
        </svg>
      );
    case "circle":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "icosahedron":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
          <path d="M12 2l10 13.5M12 2L2 15.5M2 8.5h20" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      );
  }
}
