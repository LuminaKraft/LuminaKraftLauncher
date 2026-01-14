import React from 'react';

interface SkeletonCardProps {
    variant?: 'modpack' | 'compact';
}

/**
 * Skeleton loading card that matches ModpackCard dimensions
 * Shows animated shimmer effect while content loads
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({ variant = 'modpack' }) => {
    if (variant === 'compact') {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden animate-pulse">
                <div className="h-32 bg-gray-200 dark:bg-gray-700" />
                <div className="p-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden animate-pulse">
            {/* Image placeholder */}
            <div className="h-48 bg-gray-200 dark:bg-gray-700 relative">
                {/* Status badge placeholder */}
                <div className="absolute top-2 right-2">
                    <div className="h-6 w-16 bg-gray-300 dark:bg-gray-600 rounded-full" />
                </div>
            </div>

            {/* Content placeholder */}
            <div className="p-4">
                {/* Category badge */}
                <div className="flex items-center gap-2 mb-2">
                    <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                </div>

                {/* Title */}
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />

                {/* Subtitle */}
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3" />

                {/* Badges */}
                <div className="flex gap-2 mb-3">
                    <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                        <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                        <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    </div>
                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                </div>
            </div>
        </div>
    );
};

interface SkeletonGridProps {
    count?: number;
    variant?: 'modpack' | 'compact';
}

/**
 * Grid of skeleton cards for loading state
 */
export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 6, variant = 'modpack' }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: count }).map((_, index) => (
                <SkeletonCard key={index} variant={variant} />
            ))}
        </div>
    );
};

/**
 * Skeleton for page headers (title + subtitle + action button)
 */
export const SkeletonHeader: React.FC<{ showButton?: boolean }> = ({ showButton = true }) => {
    return (
        <div className="flex justify-between items-center mb-8 animate-pulse">
            <div>
                <div className="h-8 w-48 bg-gray-200 dark:bg-dark-700 rounded mb-2" />
                <div className="h-4 w-64 bg-gray-200 dark:bg-dark-700 rounded" />
            </div>
            {showButton && (
                <div className="h-12 w-40 bg-gray-200 dark:bg-dark-700 rounded-lg" />
            )}
        </div>
    );
};

/**
 * Skeleton for section titles with count badge
 */
export const SkeletonSection: React.FC = () => {
    return (
        <div className="flex items-center space-x-2 border-b border-dark-700 pb-2 mb-4 animate-pulse">
            <div className="h-6 w-32 bg-gray-200 dark:bg-dark-700 rounded" />
            <div className="h-5 w-8 bg-gray-200 dark:bg-dark-700 rounded-full" />
        </div>
    );
};

export default SkeletonCard;
