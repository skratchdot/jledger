// Adapted from shadcn/ui's Base UI button pattern (MIT).
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/button.tsx
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#b78a53] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border border-[#344f39] bg-[#3c5941] px-4 py-2.5 text-white hover:bg-[#2c4431]',
        outline:
          'border border-[#d9dfd1] bg-white px-4 py-2.5 hover:bg-[#f3f6ee]',
        ghost: 'bg-transparent hover:bg-[#e7ece1]',
      },
      size: { default: 'min-h-9', sm: 'min-h-8 px-3', icon: 'size-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size }),
        typeof className === 'string' ? className : '',
      )}
      {...props}
    />
  );
}
export { Button, buttonVariants };
