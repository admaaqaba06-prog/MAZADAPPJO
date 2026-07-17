import React from "react";

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
}

export function Logo({
  className = "h-10 w-auto",
}: LogoProps) {
  return (
    <img
      src="https://i.ibb.co/35fHWLqL/image.png"
      alt="mazado"
      className={`object-contain ${className}`}
    />
  );
}
