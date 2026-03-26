import React, { useState, useEffect } from 'react';
import { Shield, ArrowLeft, ChatCircleDots } from '@phosphor-icons/react';
import { verifyOTP, resendOTP } from '../lib/api';
import { toast } from 'sonner';

export default function OTPVerifyPage({ mfaData, onVerified, onBack }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleChange = (index, value) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    const nextEmpty = pasted.length < 6 ? pasted.length : 5;
    document.getElementById(`otp-${nextEmpty}`)?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOTP({
        email: mfaData.email,
        otp_code: code,
        device_fingerprint: mfaData.device_fingerprint || ''
      });
      onVerified(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid OTP');
      setOtp(['', '', '', '', '', '']);
      document.getElementById('otp-0')?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await resendOTP(mfaData.email);
      toast.success('New OTP sent. Check server logs.');
      setCountdown(60);
      setCanResend(false);
    } catch (err) {
      toast.error('Failed to resend OTP');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: '#030303' }}>
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      <div className="w-full max-w-md relative">
        <button
          data-testid="otp-back-button"
          onClick={onBack}
          className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#10B981] font-mono text-xs mb-6 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>BACK TO LOGIN</span>
        </button>

        <div className="terminal-card p-6 sm:p-8 animate-fade-in" data-testid="otp-verify-card">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 border border-[#10B981]/40 rounded-sm mb-4 bg-[#0A0A0A]">
              <ChatCircleDots size={28} weight="duotone" className="text-[#10B981] glow-green" />
            </div>
            <h2 className="font-mono text-xl font-bold tracking-tighter text-[#F9FAFB]">
              OTP Verification
            </h2>
            <p className="font-sans text-sm text-[#9CA3AF] mt-2">
              Enter the 6-digit code sent to <span className="text-[#10B981] font-mono">{mfaData.email}</span>
            </p>
            <p className="font-mono text-[10px] text-[#F59E0B] mt-2 uppercase tracking-widest">
              Check server console for OTP code
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="flex gap-2 sm:gap-3 justify-center mb-8 otp-container" data-testid="otp-input-container">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  data-testid={`otp-input-${i}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  className="w-11 h-14 sm:w-12 sm:h-16 text-center text-xl font-mono bg-[#0A0A0A] border border-[#10B981]/20 rounded-sm text-[#00FF41] focus:border-[#10B981] focus:shadow-[0_0_10px_rgba(16,185,129,0.3)] outline-none transition-all"
                />
              ))}
            </div>

            <button
              data-testid="verify-otp-button"
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              <Shield size={18} />
              <span>{loading ? 'Verifying...' : 'Verify Code'}</span>
            </button>
          </form>

          <div className="mt-6 text-center">
            {canResend ? (
              <button
                data-testid="resend-otp-button"
                onClick={handleResend}
                className="font-mono text-xs text-[#10B981] hover:text-[#00FF41] transition-colors"
              >
                &gt; Resend OTP
              </button>
            ) : (
              <span className="font-mono text-xs text-[#4B5563]">
                Resend in <span className="text-[#F59E0B]">{countdown}s</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
