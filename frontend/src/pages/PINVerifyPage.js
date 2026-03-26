import React, { useState } from 'react';
import { Shield, ArrowLeft, NumberSquareNine } from '@phosphor-icons/react';
import { verifyPIN } from '../lib/api';
import { toast } from 'sonner';

export default function PINVerifyPage({ mfaData, onVerified, onBack }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pin.length < 4) {
      toast.error('Enter your security PIN');
      return;
    }
    setLoading(true);
    try {
      const res = await verifyPIN({
        email: mfaData.email,
        pin,
        token: mfaData.partial_token || ''
      });
      onVerified(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: '#030303' }}>
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(rgba(236,72,153,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(236,72,153,0.3) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />
      <div className="w-full max-w-md relative">
        <button data-testid="pin-back-button" onClick={onBack} className="flex items-center gap-2 text-[#9CA3AF] hover:text-[#EC4899] font-mono text-xs mb-6 transition-colors">
          <ArrowLeft size={14} /><span>BACK</span>
        </button>
        <div className="terminal-card p-6 sm:p-8 animate-fade-in" data-testid="pin-verify-card">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 border border-[#EC4899]/40 rounded-sm mb-4 bg-[#0A0A0A]">
              <NumberSquareNine size={28} weight="duotone" className="text-[#EC4899] glow-green" />
            </div>
            <h2 className="font-mono text-xl font-bold tracking-tighter text-[#F9FAFB]">Security PIN</h2>
            <p className="font-sans text-sm text-[#9CA3AF] mt-2">Enter your personal identification number</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <input
                data-testid="pin-input"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center text-2xl font-mono bg-[#0A0A0A] border border-[#EC4899]/20 rounded-sm text-[#FF69B4] p-4 focus:border-[#EC4899] focus:shadow-[0_0_10px_rgba(236,72,153,0.3)] outline-none tracking-[0.5em]"
                placeholder="****"
              />
            </div>
            <button data-testid="verify-pin-button" type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              <Shield size={18} />
              <span>{loading ? 'Verifying...' : 'Verify PIN'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
