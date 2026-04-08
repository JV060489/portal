"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

interface LivingCardProps {
  /** Main visual content of the card */
  children?: React.ReactNode;
  href?: string;
  /** Optional content overlay */
  overlay?: React.ReactNode;
  /** Aspect ratio class — e.g. "video" for aspect-video, or "9/16" for aspect-[9/16] */
  aspectRatio?: string;
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Living Card — organic blob-shaped container that breathes, tilts in 3D,
 * and has parallax depth between media and content layers.
 */
export function LivingCard({
  children,
  href,
  aspectRatio,
  overlay,
  className,
  onClick,
}: LivingCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 3D tilt springs
  const rotateX = useSpring(0, { stiffness: 200, damping: 25 });
  const rotateY = useSpring(0, { stiffness: 200, damping: 25 });

  // Parallax springs for depth layers
  const mouseX = useSpring(0, { stiffness: 150, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 150, damping: 20 });

  // Media: slight counter-movement (pushes away from cursor)
  const mediaX = useTransform(mouseX, (v) => v * -12);
  const mediaY = useTransform(mouseY, (v) => v * -12);

  // Content overlay: forward-movement (pulls toward cursor)
  const contentX = useTransform(mouseX, (v) => v * 6);
  const contentY = useTransform(mouseY, (v) => v * 6);

  // Scroll-linked entry: scale up + fade in
  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ["start end", "0.6 center"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [0.88, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      rotateX.set(y * -6);
      rotateY.set(x * 6);
      mouseX.set(x);
      mouseY.set(y);
    },
    [rotateX, rotateY, mouseX, mouseY],
  );

  const handleMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  }, [rotateX, rotateY, mouseX, mouseY]);

  const handleCardClick = useCallback(() => {
    onClick?.();
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, [href, onClick]);

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!href || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      handleCardClick();
    },
    [handleCardClick, href],
  );

  const isInteractive = !!href || !!onClick;

  return (
    <motion.div
      ref={cardRef}
      style={{ scale, opacity, perspective: 1200 }}
      className={cn("relative block w-full h-full", className)}
    >
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        onClick={isInteractive ? handleCardClick : undefined}
        onKeyDown={isInteractive ? handleCardKeyDown : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        role={isInteractive ? "link" : undefined}
        style={{
          rotateX,
          rotateY,
          aspectRatio:
            aspectRatio !== "video" && aspectRatio ? aspectRatio : undefined,
        }}
        className={cn(
          "relative overflow-hidden rounded-2xl w-full h-full border border-neutral-800 md:border-transparent",
          aspectRatio === "video" ? "aspect-video" : undefined,
          "bg-neutral-900",
          isInteractive ? "cursor-pointer" : undefined,
        )}
      >
        {/* Rotating gradient border — visible on hover */}
        <div
          className={cn(
            "pointer-events-none absolute -inset-px z-30 transition-opacity duration-500",
            isHovered ? "opacity-100 glow-border-spin" : "opacity-0",
          )}
          style={{
            background:
              "conic-gradient(from var(--border-angle, 0deg), #222, #444, #666, #444, #222)",
            mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "1.5px",
            borderRadius: "inherit",
          }}
        />

        {/* Visual layer — counter-parallax */}
        <motion.div
          style={{ x: mediaX, y: mediaY }}
          className="relative h-full w-full flex items-center justify-center p-0 md:p-6"
        >
          {children}
        </motion.div>

        {/* Content overlay — forward-parallax */}
        {overlay && (
          <motion.div
            style={{ x: contentX, y: contentY }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-6 bg-black/40 backdrop-blur-[2px]"
          >
            {overlay}
          </motion.div>
        )}

        {/* Hover ambient glow */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 transition-opacity duration-500",
            isHovered ? "opacity-100" : "opacity-0",
          )}
          style={{
            background:
              "radial-gradient(ellipse at 50% 80%, rgba(255,255,255,0.06), transparent 70%)",
          }}
        />
      </motion.div>
    </motion.div>
  );
}
