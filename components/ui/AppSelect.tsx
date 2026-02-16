import React from 'react';
import { ChevronDown } from 'lucide-react';

type AppSelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
    wrapperClassName?: string;
};

export const AppSelect = React.forwardRef<HTMLSelectElement, AppSelectProps>(
    ({ className = '', wrapperClassName = '', children, ...props }, ref) => {
        return (
            <div className={`relative ${wrapperClassName}`.trim()}>
                <select
                    ref={ref}
                    {...props}
                    className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-all appearance-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 pr-9 ${className}`.trim()}
                >
                    {children}
                </select>
                <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
            </div>
        );
    },
);

AppSelect.displayName = 'AppSelect';
