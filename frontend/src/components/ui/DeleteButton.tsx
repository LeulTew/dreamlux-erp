import * as React from "react"
import { useLanguage } from "@/hooks/use-language"
import { cn } from "@/lib/utils"

export interface DeleteButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltipText?: string
  iconSize?: number
  className?: string
}

export function DeleteButton({
  tooltipText,
  iconSize = 18,
  className,
  ...props
}: DeleteButtonProps) {
  const { lang } = useLanguage()

  // Default localized tooltip text
  const label = tooltipText || (lang === "en" ? "remove" : "ማስወገጃ")

  return (
    <div className="relative inline-block group/tooltip select-none">
      <button
        type="button"
        className={cn(
          "flex flex-col justify-center items-center p-2 border-0 solid border-transparent bg-red-500/10 dark:bg-red-500/15 text-red-500 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-500/40 cursor-pointer",
          // Smooth box shadow on hover from Uiverse.io
          "hover:shadow-[3.4px_2.5px_4.9px_rgba(0,0,0,0.025),8.6px_6.3px_12.4px_rgba(0,0,0,0.035),17.5px_12.8px_25.3px_rgba(0,0,0,0.045),36.1px_26.3px_52.2px_rgba(0,0,0,0.055),99px_72px_143px_rgba(0,0,0,0.08)]",
          className
        )}
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 20 20"
          style={{ height: iconSize, width: iconSize }}
          className="currentColor shrink-0 pointer-events-none"
        >
          <path
            fill="currentColor"
            d="M8.78842 5.03866C8.86656 4.96052 8.97254 4.91663 9.08305 4.91663H11.4164C11.5269 4.91663 11.6329 4.96052 11.711 5.03866C11.7892 5.11681 11.833 5.22279 11.833 5.33329V5.74939H8.66638V5.33329C8.66638 5.22279 8.71028 5.11681 8.78842 5.03866ZM7.16638 5.74939V5.33329C7.16638 4.82496 7.36832 4.33745 7.72776 3.978C8.08721 3.61856 8.57472 3.41663 9.08305 3.41663H11.4164C11.9247 3.41663 12.4122 3.61856 12.7717 3.978C13.1311 4.33745 13.333 4.82496 13.333 5.33329V5.74939H15.5C15.9142 5.74939 16.25 6.08518 16.25 6.49939C16.25 6.9136 15.9142 7.24939 15.5 7.24939H15.0105L14.2492 14.7095C14.2382 15.2023 14.0377 15.6726 13.6883 16.0219C13.3289 16.3814 12.8414 16.5833 12.333 16.5833H8.16638C7.65805 16.5833 7.17054 16.3814 6.81109 16.0219C6.46176 15.6726 6.2612 15.2023 6.25019 14.7095L5.48896 7.24939H5C4.58579 7.24939 4.25 6.9136 4.25 6.49939C4.25 6.08518 4.58579 5.74939 5 5.74939H6.16667H7.16638ZM7.91638 7.24996H12.583H13.5026L12.7536 14.5905C12.751 14.6158 12.7497 14.6412 12.7497 14.6666C12.7497 14.7771 12.7058 14.8831 12.6277 14.9613C12.5495 15.0394 12.4436 15.0833 12.333 15.0833H8.16638C8.05588 15.0833 7.94989 15.0394 7.87175 14.9613C7.79361 14.8831 7.74972 14.7771 7.74972 14.6666C7.74972 14.6412 7.74842 14.6158 7.74584 14.5905L6.99681 7.24996H7.91638Z"
            clipRule="evenodd"
            fillRule="evenodd"
          />
        </svg>
      </button>
      <span className="pointer-events-none invisible opacity-0 scale-95 group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:scale-100 transition-all duration-200 ease-out bg-neutral-900/90 dark:bg-neutral-100 dark:text-neutral-950 text-neutral-100 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shadow-md absolute z-50 top-1/2 -translate-y-1/2 left-[110%] ml-2">
        {label}
      </span>
    </div>
  )
}
