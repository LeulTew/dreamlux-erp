import { HiUserCircle } from "react-icons/hi2";

type UserAvatarProps = {
  fullName?: string | null;
  imageUrl?: string | null;
  sizeClassName?: string;
  className?: string;
  textClassName?: string;
};

function getInitials(name?: string | null): string {
  if (!name) return "U";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "U";
  return parts.map((part) => part[0].toUpperCase()).join("");
}

export default function UserAvatar({
  fullName,
  imageUrl,
  sizeClassName = "w-10 h-10",
  className = "",
  textClassName = "text-xs font-black text-muted",
}: UserAvatarProps) {
  return (
    <div
      className={`${sizeClassName} rounded-full overflow-hidden border border-border bg-card-alt flex items-center justify-center ${className}`.trim()}
      aria-label={fullName ? `${fullName} profile` : "User profile"}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={fullName || "User profile"} className="w-full h-full object-cover" loading="lazy" />
      ) : fullName ? (
        <span className={textClassName}>{getInitials(fullName)}</span>
      ) : (
        <HiUserCircle className="w-5 h-5 text-foreground opacity-50" />
      )}
    </div>
  );
}
