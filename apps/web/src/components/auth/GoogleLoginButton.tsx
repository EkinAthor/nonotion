import { GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '@/stores/authStore';

interface GoogleLoginButtonProps {
  onSuccess?: () => void;
}

export default function GoogleLoginButton({ onSuccess }: GoogleLoginButtonProps) {
  const { googleLogin, clearError } = useAuthStore();

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={async (response) => {
          if (response.credential) {
            clearError();
            try {
              await googleLogin(response.credential);
              onSuccess?.();
            } catch {
              // Error handled in store
            }
          }
        }}
        onError={() => {
          useAuthStore.setState({ error: 'Google sign-in failed. Please try again.' });
        }}
        width="400"
        text="signin_with"
        shape="rectangular"
        size="large"
      />
    </div>
  );
}
