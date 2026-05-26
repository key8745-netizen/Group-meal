import { type HTMLAttributes } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

export function Badge({ className = '', variant = 'default', ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default:     'bg-primary text-primary-foreground',
    secondary:   'bg-secondary text-secondary-foreground',
    outline:     'border text-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
