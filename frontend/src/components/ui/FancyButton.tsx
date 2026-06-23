import * as React from "react"

export interface FancyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
}

export function FancyButton({
  children,
  className,
  ...props
}: FancyButtonProps) {
  const uniqueId = React.useId().replace(/:/g, "-");

  return (
    <>
      <style>{`
        .fancy-${uniqueId} {
          background-color: transparent;
          border: 2px solid var(--foreground, #000000);
          border-radius: 16px;
          box-sizing: border-box;
          color: var(--foreground, #000000);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin: 0;
          outline: none;
          overflow: visible;
          padding: 8px 24px;
          position: relative;
          text-align: center;
          text-decoration: none;
          text-transform: uppercase;
          transition: all 0.3s ease-in-out;
          user-select: none;
          font-size: 12px;
          height: 44px;
          flex-shrink: 0;
        }

        .dark .fancy-${uniqueId} {
          border-color: #ffffff;
          color: #ffffff;
        }

        .fancy-${uniqueId}::before {
          content: " ";
          width: 25px;
          height: 2px;
          background: var(--foreground, #000000);
          top: 50%;
          left: 1.5em;
          position: absolute;
          transform: translateY(-50%);
          transform-origin: center;
          transition: background 0.3s linear, width 0.3s linear;
        }

        .dark .fancy-${uniqueId}::before {
          background: #ffffff;
        }

        .fancy-${uniqueId} .text-${uniqueId} {
          font-size: 13px;
          line-height: 1.2;
          padding-left: 20px;
          display: block;
          text-align: left;
          transition: all 0.3s ease-in-out;
          text-transform: uppercase;
          text-decoration: none;
          color: var(--foreground, #000000);
        }

        .dark .fancy-${uniqueId} .text-${uniqueId} {
          color: #ffffff;
        }

        .fancy-${uniqueId} .top-key-${uniqueId} {
          height: 2px;
          width: 25px;
          top: -2px;
          left: 16px;
          position: absolute;
          background: var(--background, #ffffff);
          transition: width 0.5s ease-out, left 0.3s ease-out;
        }

        .dark .fancy-${uniqueId} .top-key-${uniqueId} {
          background: #09090b;
        }

        .fancy-${uniqueId} .bottom-key-1-${uniqueId} {
          height: 2px;
          width: 25px;
          right: 36px;
          bottom: -2px;
          position: absolute;
          background: var(--background, #ffffff);
          transition: width 0.5s ease-out, right 0.3s ease-out;
        }

        .dark .fancy-${uniqueId} .bottom-key-1-${uniqueId} {
          background: #09090b;
        }

        .fancy-${uniqueId} .bottom-key-2-${uniqueId} {
          height: 2px;
          width: 10px;
          right: 16px;
          bottom: -2px;
          position: absolute;
          background: var(--background, #ffffff);
          transition: width 0.5s ease-out, right 0.3s ease-out;
        }

        .dark .fancy-${uniqueId} .bottom-key-2-${uniqueId} {
          background: #09090b;
        }

        .fancy-${uniqueId}:hover {
          color: var(--background, #ffffff);
          background: var(--foreground, #000000);
          border-radius: 16px;
        }

        .dark .fancy-${uniqueId}:hover {
          color: #09090b;
          background: #ffffff;
          border-radius: 16px;
        }

        .fancy-${uniqueId}:hover::before {
          width: 15px;
          background: var(--background, #ffffff);
        }

        .dark .fancy-${uniqueId}:hover::before {
          background: #09090b;
        }

        .fancy-${uniqueId}:hover .text-${uniqueId} {
          color: var(--background, #ffffff);
          padding-left: 15px;
        }

        .dark .fancy-${uniqueId}:hover .text-${uniqueId} {
          color: #09090b;
        }

        .fancy-${uniqueId}:hover .top-key-${uniqueId} {
          left: -2px;
          width: 0px;
        }

        .fancy-${uniqueId}:hover .bottom-key-1-${uniqueId},
        .fancy-${uniqueId}:hover .bottom-key-2-${uniqueId} {
          right: 0;
          width: 0;
        }
      `}</style>
      <button
        type="button"
        className={`fancy-${uniqueId} ${className || ""}`}
        {...props}
      >
        <span className={`top-key-${uniqueId}`}></span>
        <span className={`text-${uniqueId}`}>{children}</span>
        <span className={`bottom-key-1-${uniqueId}`}></span>
        <span className={`bottom-key-2-${uniqueId}`}></span>
      </button>
    </>
  )
}
