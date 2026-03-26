import React, { useState, useCallback } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import OTPVerifyPage from './pages/OTPVerifyPage';
import TOTPVerifyPage from './pages/TOTPVerifyPage';
import PINVerifyPage from './pages/PINVerifyPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';

function AppContent() {
  const { isAuthenticated, loading, loginUser } = useAuth();
  const [view, setView] = useState('login');
  const [mfaData, setMfaData] = useState(null);
  const [mfaStepIndex, setMfaStepIndex] = useState(0);

  const handleMFARequired = useCallback((data) => {
    setMfaData(data);
    setMfaStepIndex(0);
    const firstStep = data.mfa_steps[0];
    setView(firstStep === 'otp' ? 'otp' : firstStep === 'totp' ? 'totp' : firstStep === 'pin' ? 'pin' : 'otp');
  }, []);

  const handleLoginSuccess = useCallback((token, userData) => {
    loginUser(token, userData);
    setView('dashboard');
    setMfaData(null);
  }, [loginUser]);

  const handleMFAStepComplete = useCallback((result) => {
    if (result.status === 'authenticated') {
      handleLoginSuccess(result.token, result.user);
      return;
    }
    // Move to next MFA step
    if (result.remaining_steps && result.remaining_steps.length > 0) {
      const nextStep = result.remaining_steps[0];
      setMfaData(prev => ({ ...prev, partial_token: result.partial_token }));
      setMfaStepIndex(prev => prev + 1);
      setView(nextStep === 'otp' ? 'otp' : nextStep === 'totp' ? 'totp' : 'pin');
    }
  }, [handleLoginSuccess]);

  const handleBackToLogin = useCallback(() => {
    setView('login');
    setMfaData(null);
    setMfaStepIndex(0);
  }, []);

  const handleNavigate = useCallback((page) => {
    setView(page);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#030303' }}>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 border border-[#10B981]/40 rounded-sm mb-4 animate-pulse">
            <svg className="w-6 h-6 text-[#10B981]" fill="currentColor" viewBox="0 0 256 256">
              <path d="M208,40H48A16,16,0,0,0,32,56V200a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V56A16,16,0,0,0,208,40Zm0,160H48V56H208V200Z" />
            </svg>
          </div>
          <p className="font-mono text-xs text-[#10B981] tracking-widest uppercase">Initializing...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && (view === 'login' || view === 'otp' || view === 'totp' || view === 'pin')) {
    setView('dashboard');
  }

  return (
    <>
      {view === 'login' && !isAuthenticated && (
        <LoginPage onMFARequired={handleMFARequired} onLoginSuccess={handleLoginSuccess} />
      )}
      {view === 'otp' && mfaData && (
        <OTPVerifyPage mfaData={mfaData} onVerified={handleMFAStepComplete} onBack={handleBackToLogin} />
      )}
      {view === 'totp' && mfaData && (
        <TOTPVerifyPage mfaData={mfaData} onVerified={handleMFAStepComplete} onBack={handleBackToLogin} />
      )}
      {view === 'pin' && mfaData && (
        <PINVerifyPage mfaData={mfaData} onVerified={handleMFAStepComplete} onBack={handleBackToLogin} />
      )}
      {view === 'dashboard' && isAuthenticated && (
        <DashboardPage onNavigate={handleNavigate} />
      )}
      {view === 'settings' && isAuthenticated && (
        <SettingsPage onNavigate={handleNavigate} />
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0A0A0A',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#F9FAFB',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.75rem',
            borderRadius: '2px'
          }
        }}
      />
      <AppContent />
    </AuthProvider>
  );
}

export default App;
