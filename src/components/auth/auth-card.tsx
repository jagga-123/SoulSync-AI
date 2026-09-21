import type { ReactNode } from "react";
import { Heart } from "lucide-react";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
  maxWidthClassName = "max-w-md",
}: AuthCardProps) {
  return (
    <div className="relative flex min-h-svh items-center justify-center px-4 py-28 sm:px-6">
      <div className={`glass-strong w-full rounded-3xl p-8 sm:p-10 ${maxWidthClassName}`}>
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-lg shadow-primary/25">
            <Heart className="size-6 fill-white text-white" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold text-white">{title}</h1>
          {description && (
            <p className="mt-2 text-pretty text-sm leading-relaxed text-white/55">
              {description}
            </p>
          )}
        </div>

        <div className="mt-8">{children}</div>

        {footer && (
          <div className="mt-6 text-center text-sm text-white/55">{footer}</div>
        )}
      </div>
    </div>
  );
}
