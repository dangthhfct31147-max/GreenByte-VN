import React, { useState, useEffect, useRef, memo } from 'react';

// Simple class merger utility since we don't have the full 'cn' utility yet
function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    alt: string;
    fallback?: string;
    placeholderColor?: string;
    aspectRatio?: 'video' | 'square' | 'portrait' | 'auto';
    lazy?: boolean;
    onLoadComplete?: () => void;
}

// Default placeholder - small base64 gray image
const DEFAULT_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTJlOGYwIi8+PC9zdmc+';

const OptimizedImage: React.FC<OptimizedImageProps> = memo(({
    src,
    alt,
    fallback,
    placeholderColor = 'bg-slate-200',
    aspectRatio = 'auto',
    lazy = true,
    className,
    onLoadComplete,
    ...props
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);
    const [isInView, setIsInView] = useState(!lazy);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Intersection Observer for lazy loading
    useEffect(() => {
        if (!lazy || isInView) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observer.disconnect();
                    }
                });
            },
            {
                rootMargin: '100px', // Start loading 100px before entering viewport
                threshold: 0.01,
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, [lazy, isInView]);

    // Handle image load
    const handleLoad = () => {
        setIsLoaded(true);
        setIsError(false);
        onLoadComplete?.();
    };

    // Handle image error
    const handleError = () => {
        if (!isError && fallback && fallback !== src) {
            setIsError(true);
            setIsLoaded(false);
            return;
        }

        setIsLoaded(true);
    };

    // Determine the actual source to use
    const actualSrc = isError && fallback ? fallback : src;
    const displaySrc = isInView ? actualSrc : DEFAULT_PLACEHOLDER;

    // Aspect ratio classes
    const aspectClasses = {
        video: 'aspect-video',
        square: 'aspect-square',
        portrait: 'aspect-[3/4]',
        auto: '',
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                'relative overflow-hidden',
                aspectClasses[aspectRatio],
                !isLoaded && placeholderColor,
                className
            )}
        >
            {/* Placeholder shimmer effect */}
            {!isLoaded && (
                <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
            )}

            {/* Actual image */}
            <img
                ref={imgRef}
                src={displaySrc}
                alt={alt}
                loading={lazy ? 'lazy' : 'eager'}
                decoding="async"
                onLoad={handleLoad}
                onError={handleError}
                className={cn(
                    'w-full h-full object-cover transition-opacity duration-300',
                    isLoaded ? 'opacity-100' : 'opacity-0'
                )}
                {...props}
            />
        </div>
    );
});

OptimizedImage.displayName = 'OptimizedImage';

export default OptimizedImage;
