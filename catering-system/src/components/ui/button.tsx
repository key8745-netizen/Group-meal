import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'default', size = 'default', ...props }, ref) => {
    const variants: Record<string, string> = {
      default:     'bg-primary text-primary-foreground hover:bg-primary/90',
      outline:     'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost:       'hover:bg-accent hover:text-accent-foreground',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    };
    const sizes: Record<string, string> = {
      default: 'h-9 px-4 py-2',
      sm:      'h-8 px-3 text-xs',
      lg:      'h-10 px-8',
      icon:    'h-9 w-9',
    };
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
