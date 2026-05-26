import { type HTMLAttributes } from 'react';

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'warning';
}

const variants: Record<string, string> = {
  default:     'border bg-background text-foreground',
  destructive: 'border-destructive/50 text-destructive bg-destructive/5',
  warning:     'border-amber-200 text-amber-800 bg-amber-50',
};

export function Alert({ className = '', variant = 'default', ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={`relative w-full rounded-lg p-4 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function AlertTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`} {...props} />
  );
}

export function AlertDescription({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div className={`text-sm [&_p]:leading-relaxed ${className}`} {...props} />
  );
}
