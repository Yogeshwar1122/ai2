import React, { useState } from 'react';
import { Shield, Eye, EyeSlash, Fingerprint, EnvelopeSimple, Lock, UserPlus, SignIn } from '@phosphor-icons/react';
import { login, register } from '../lib/api';
import { toast } from 'sonner';

export default function LoginPage({ onMFARequired, onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const getDeviceFingerprint = () => {
    const nav = window.navigator;
    const raw = [nav.userAgent, nav.language, nav.platform, screen.width, screen.height, new Date().getTimezoneOffset()].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        await register({ email, password, display_name: displayName });
        toast.success('Account created. Please log in.');
        setIsRegister(false);
      } else {
        const fp = getDeviceFingerprint();
        const res = await login({
          email,
          password,
          device_fingerprint: fp,
          user_agent: navigator.userAgent
        });
        if (res.data.mfa_required) {
          onMFARequired({
            ...res.data,
            email,
            device_fingerprint: fp
          });
        } else {
          onLoginSuccess(res.data.token, res.data.user);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: '#030303' }}>
      {/* Background grid effect */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(rgba(236,72,153,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(236,72,153,0.3) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-10 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 border border-[#EC4899]/40 rounded-sm mb-4 bg-[#0A0A0A]">
            <Shield size={32} weight="duotone" className="text-[#EC4899] glow-green" />
          </div>
          <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-tighter text-[#F9FAFB]">
            LOCK<span className="text-[#EC4899]">BOX</span>
          </h1>
          <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#4B5563] mt-2">
            Secure Authentication System
          </p>
        </div>

        {/* Login Card */}
        <div className="terminal-card trace-border p-6 sm:p-8 animate-fade-in animate-delay-2" data-testid="login-card">
          <div className="flex items-center gap-2 mb-6 pb-3 border-b border-[#EC4899]/10">
            <div className="w-2 h-2 rounded-full bg-[#EC4899] pulse-green" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#EC4899]">
              {isRegister ? '> register_new_identity' : '> authenticate'}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegister && (
              <div className="animate-fade-in">
                <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">
                  Display Name
                </label>
                <div className="relative">
                  <Fingerprint size={18} className="absolute left-0 top-1/2 -translate-y-1/2 text-[#4B5563]" />
                  <input
                    data-testid="register-name-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="terminal-input pl-7"
                    placeholder="identity_name"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">
                Email Address
              </label>
              <div className="relative">
                <EnvelopeSimple size={18} className="absolute left-0 top-1/2 -translate-y-1/2 text-[#4B5563]" />
                <input
                  data-testid="email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="terminal-input pl-7"
                  placeholder="user@domain.com"
                />
              </div>
            </div>

            <div>
              <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-0 top-1/2 -translate-y-1/2 text-[#4B5563]" />
                <input
                  data-testid="password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="terminal-input pl-7 pr-8"
                  placeholder="••••••••"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#EC4899] transition-colors"
                  data-testid="toggle-password-visibility"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              data-testid="submit-button"
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-6"
            >
              {loading ? (
                <span className="font-mono text-sm">Processing...</span>
              ) : (
                <>
                  {isRegister ? <UserPlus size={18} /> : <SignIn size={18} />}
                  <span>{isRegister ? 'Create Identity' : 'Authenticate'}</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#EC4899]/10 text-center">
            <button
              data-testid="toggle-auth-mode"
              onClick={() => setIsRegister(!isRegister)}
              className="font-mono text-xs text-[#9CA3AF] hover:text-[#EC4899] transition-colors tracking-wide"
            >
              {isRegister ? '> Already have identity? Authenticate' : '> New user? Create identity'}
            </button>
          </div>
        </div>

        {/* Security info */}
        <div className="mt-6 flex items-center justify-center gap-4 text-[#4B5563] animate-fade-in animate-delay-4">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest">
            <Lock size={12} className="text-[#EC4899]" />
            <span>AES-256</span>
          </div>
          <div className="w-px h-3 bg-[#EC4899]/20" />
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest">
            <Shield size={12} className="text-[#EC4899]" />
            <span>MFA Enabled</span>
          </div>
          <div className="w-px h-3 bg-[#EC4899]/20" />
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest">
            <Fingerprint size={12} className="text-[#EC4899]" />
            <span>Device Lock</span>
          </div>
        </div>
      </div>
    </div>
  );
}
