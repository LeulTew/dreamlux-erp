"use client";
import { useState } from "react";
import Image from "next/image";
import { HiUserCircle } from "react-icons/hi2";

interface Props {
  src: string | null;
  alt: string;
}

export default function ImageCell({ src, alt }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!src) {
    return (
      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-sm hover:bg-primary/20 transition-all">
        <HiUserCircle className="w-8 h-8 opacity-100" />
      </div>
    );
  }

  return (
    <div className="relative">
      <Image
        src={src}
        alt={alt}
        width={expanded ? 192 : 48}
        height={expanded ? 192 : 48}
        onClick={() => setExpanded(!expanded)}
        className={`rounded-lg object-cover cursor-pointer border-2 border-primary-light hover:border-primary transition-all ${
          expanded ? "shadow-xl z-10" : ""
        }`}
        unoptimized
      />
    </div>
  );
}
