import { useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

interface AdminGuardProps {
    children: ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
    const navigate = useNavigate();
    const { isAdmin, isLoading } = useAuthStore();

    useEffect(() => {
        if (!isLoading && !isAdmin()) {
            navigate('/', { replace: true });
        }
    }, [isLoading, isAdmin, navigate]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-notion-bg">
                <div className="text-notion-text-secondary">Loading...</div>
            </div>
        );
    }

    if (!isAdmin()) {
        return null;
    }

    return <>{children}</>;
}
