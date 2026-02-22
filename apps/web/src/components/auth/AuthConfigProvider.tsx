import { useEffect, type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useAuthStore } from '@/stores/authStore';

interface AuthConfigProviderProps {
  children: ReactNode;
}

export default function AuthConfigProvider({ children }: AuthConfigProviderProps) {
  const { fetchAuthConfig, authConfig, authConfigLoading } = useAuthStore();

  useEffect(() => {
    fetchAuthConfig();
  }, [fetchAuthConfig]);

  // While loading config for the first time, render children anyway
  // (authenticated users don't need to wait for config)
  if (authConfigLoading && !authConfig) {
    return <>{children}</>;
  }

  const googleClientId = authConfig?.googleClientId;

  if (googleClientId && authConfig?.enabledModes.includes('google')) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        {children}
      </GoogleOAuthProvider>
    );
  }

  return <>{children}</>;
}
