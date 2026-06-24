import * as React from "react"

export interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  icon?: React.ReactNode;
  variant?: "primary" | "default" | "secondary" | "outline" | "destructive";
}

export function PillButton({
  children,
  className,
  icon,
  variant = "default",
  ...props
}: PillButtonProps) {
  const uniqueId = React.useId().replace(/:/g, "-");
  const variantClass = `bubble-btn-${uniqueId}--${variant}`;

  return (
    <>
      <style>{`
        .bubble-btn-${uniqueId} {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px 20px;
          border: 1px solid var(--border, rgba(128,128,128,0.35));
          border-radius: var(--radius-2xl, 22px);
          transition: all 0.2s ease-in;
          position: relative;
          overflow: hidden;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          color: var(--foreground, #000000);
          background: transparent;
          z-index: 1;
          height: 44px;
        }

        .bubble-btn-${uniqueId}--primary,
        .bubble-btn-${uniqueId}--default {
          border-color: var(--primary, #d4af37);
          color: var(--foreground, #000000);
        }

        .bubble-btn-${uniqueId}--secondary {
          background: var(--card, transparent);
          color: var(--foreground, #000000);
        }

        .bubble-btn-${uniqueId}--outline {
          background: transparent;
          color: var(--foreground, #000000);
        }

        .bubble-btn-${uniqueId}--destructive {
          border-color: var(--danger, #dc2626);
          color: var(--danger, #dc2626);
        }

        .dark .bubble-btn-${uniqueId} {
          color: #ffffff;
        }

        .bubble-btn-${uniqueId}:before {
          content: "";
          position: absolute;
          left: 50%;
          transform: translateX(-50%) scaleY(1) scaleX(1.25);
          top: 100%;
          width: 140%;
          height: 180%;
          background-color: rgba(0, 0, 0, 0.05);
          border-radius: 50%;
          display: block;
          transition: all 0.5s 0.1s cubic-bezier(0.55, 0, 0.1, 1);
          z-index: -1;
        }

        .bubble-btn-${uniqueId}:after {
          content: "";
          position: absolute;
          left: 55%;
          transform: translateX(-50%) scaleY(1) scaleX(1.45);
          top: 180%;
          width: 160%;
          height: 190%;
          background-color: var(--primary, #d4af37);
          border-radius: 50%;
          display: block;
          transition: all 0.5s 0.1s cubic-bezier(0.55, 0, 0.1, 1);
          z-index: -1;
        }

        .bubble-btn-${uniqueId}:hover {
          color: #ffffff;
          border-color: var(--primary, #d4af37);
        }

        .dark .bubble-btn-${uniqueId}:hover {
          color: #ffffff;
          border-color: var(--primary, #d4af37);
        }

        .bubble-btn-${uniqueId}:hover:before {
          top: -35%;
          background-color: var(--primary, #d4af37);
          transform: translateX(-50%) scaleY(1.3) scaleX(0.8);
        }

        .bubble-btn-${uniqueId}:hover:after {
          top: -45%;
          background-color: var(--primary, #d4af37);
          transform: translateX(-50%) scaleY(1.3) scaleX(0.8);
        }

        .bubble-btn-${uniqueId}--destructive:after,
        .bubble-btn-${uniqueId}--destructive:hover:before,
        .bubble-btn-${uniqueId}--destructive:hover:after {
          background-color: var(--danger, #dc2626);
        }

        .bubble-btn-${uniqueId}--destructive:hover {
          border-color: var(--danger, #dc2626);
        }

        .bubble-btn-${uniqueId} .btn-icon-${uniqueId} {
          z-index: 2;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
      <button
        type="button"
        className={`bubble-btn-${uniqueId} ${variantClass} ${className || ""}`}
        {...props}
      >
        {icon && <span className={`btn-icon-${uniqueId}`}>{icon}</span>}
        <span className="relative z-10">{children}</span>
      </button>
    </>
  )
}
