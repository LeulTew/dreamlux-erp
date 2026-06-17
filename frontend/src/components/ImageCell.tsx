"use client";
import { useState } from "react";
import Image from "next/image";
import { HiUserCircle } from "react-icons/hi2";

interface Props {
  src: string | null;
  alt: string;
  size?: number;
}

export default function ImageCell({ src, alt, size = 48 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const iconSize = Math.max(24, size - 16);

  if (!src) {
    return (
      <div
        className="rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-sm hover:bg-primary/20 transition-all"
        style={{ width: size, height: size }}
      >
        <HiUserCircle className="opacity-100" style={{ width: iconSize, height: iconSize }} />
      </div>
    );
  }

  return (
    <div className="relative">
      <Image
        src={src}
        alt={alt}
        width={expanded ? 192 : size}
        height={expanded ? 192 : size}
        onClick={() => setExpanded(!expanded)}
        className={`rounded-lg object-cover cursor-pointer border-2 border-primary-light hover:border-primary transition-all ${
          expanded ? "shadow-xl z-10" : ""
        }`}
        unoptimized
      />
    </div>
  );
}
