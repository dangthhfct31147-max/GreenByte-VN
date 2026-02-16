import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type AppSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'size'> & {
    onChange?: React.ChangeEventHandler<HTMLSelectElement>;
    onValueChange?: (value: string) => void;
    wrapperClassName?: string;
};

export const AppSelect = React.forwardRef<HTMLSelectElement, AppSelectProps>(
    ({
        className = '',
        wrapperClassName = '',
        children,
        value,
        onChange,
        onValueChange,
        disabled,
        id,
        title,
        name,
        'aria-label': ariaLabel,
        'aria-labelledby': ariaLabelledBy,
    }, ref) => {
        const [open, setOpen] = useState(false);
        const rootRef = useRef<HTMLDivElement | null>(null);

        const options = useMemo(() => {
            return React.Children.toArray(children)
                .filter((child): child is React.ReactElement => React.isValidElement(child))
                .map((child) => ({
                    value: String((child.props as any).value ?? ''),
                    label: String((child.props as any).children ?? ''),
                    disabled: Boolean((child.props as any).disabled),
                }));
        }, [children]);

        const selectedValue = value !== undefined ? String(value) : '';
        const selectedOption = options.find((option) => option.value === selectedValue);

        useEffect(() => {
            const onDocumentClick = (event: MouseEvent) => {
                if (!rootRef.current) return;
                if (!rootRef.current.contains(event.target as Node)) {
                    setOpen(false);
                }
            };

            document.addEventListener('mousedown', onDocumentClick);
            return () => document.removeEventListener('mousedown', onDocumentClick);
        }, []);

        const emitChange = (nextValue: string) => {
            onValueChange?.(nextValue);
            if (onChange) {
                onChange({ target: { value: nextValue } } as React.ChangeEvent<HTMLSelectElement>);
            }
        };

        return (
            <div ref={rootRef} className={`relative ${wrapperClassName}`.trim()}>
                {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
                <select
                    ref={ref}
                    value={selectedValue}
                    onChange={(event) => emitChange(event.target.value)}
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value} disabled={option.disabled}>
                            {option.label}
                        </option>
                    ))}
                </select>

                <button
                    type="button"
                    id={id}
                    title={title}
                    aria-label={ariaLabel}
                    aria-labelledby={ariaLabelledBy}
                    disabled={disabled}
                    onClick={() => setOpen((prev) => !prev)}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            setOpen(false);
                        }
                    }}
                    className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 pr-9 disabled:bg-slate-100 disabled:text-slate-400 ${className}`.trim()}
                >
                    <span className="block truncate">{selectedOption?.label ?? options[0]?.label ?? 'Chọn'}</span>
                </button>

                <ChevronDown
                    size={16}
                    className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
                />

                {open && !disabled ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[70] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-200/60">
                        <ul className="max-h-64 overflow-auto py-1">
                            {options.map((option) => {
                                const isSelected = option.value === selectedValue;
                                return (
                                    <li key={option.value}>
                                        <button
                                            type="button"
                                            disabled={option.disabled}
                                            onClick={() => {
                                                if (option.disabled) return;
                                                emitChange(option.value);
                                                setOpen(false);
                                            }}
                                            className={`w-full px-3 py-2 text-left text-sm transition-colors ${isSelected
                                                ? 'bg-slate-700 text-white'
                                                : 'text-slate-700 hover:bg-slate-100'
                                                } ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {option.label}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : null}
            </div>
        );
    },
);

AppSelect.displayName = 'AppSelect';
