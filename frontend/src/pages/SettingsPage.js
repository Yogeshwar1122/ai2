import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Shield, Lock, Fingerprint, LockKey, Desktop,
  NumberSquareNine, Trash, Eye, EyeSlash, QrCode, Check
} from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import {
  getLockConfig, updateLockConfig, setupTOTP, confirmTOTP,
  setupPIN, changePassword, getDevices, trustDevice, removeDevice
} from '../lib/api';
import { toast } from 'sonner';

export default function SettingsPage({ onNavigate }) {
  const { user, refreshUser } = useAuth();
  const [lockConfig, setLockConfig] = useState({ otp_enabled: true, totp_enabled: false, pin_enabled: false, device_lock_enabled: true });
  const [hasTOTP, setHasTOTP] = useState(false);
  const [hasPIN, setHasPIN] = useState(false);
  const [devices, setDevices] = useState([]);
  const [activeSection, setActiveSection] = useState('locks');
  const [loading, setLoading] = useState(true);

  // TOTP setup state
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');

  // PIN setup state
  const [newPIN, setNewPIN] = useState('');
  const [confirmPINValue, setConfirmPINValue] = useState('');

  // Password change state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, devicesRes] = await Promise.all([getLockConfig(), getDevices()]);
      setLockConfig(configRes.data.lock_config);
      setHasTOTP(configRes.data.has_totp);
      setHasPIN(configRes.data.has_pin);
      setDevices(devicesRes.data.devices);
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleLock = async (key, value) => {
    const updated = { ...lockConfig, [key]: value };
    try {
      await updateLockConfig(updated);
      setLockConfig(updated);
      await refreshUser();
      toast.success('Lock configuration updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update');
    }
  };

  const handleSetupTOTP = async () => {
    try {
      const res = await setupTOTP();
      setTotpSetup(res.data);
    } catch {
      toast.error('Failed to setup TOTP');
    }
  };

  const handleConfirmTOTP = async () => {
    try {
      await confirmTOTP(totpVerifyCode);
      setTotpSetup(null);
      setTotpVerifyCode('');
      setHasTOTP(true);
      await refreshUser();
      toast.success('Authenticator configured!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid code');
    }
  };

  const handleSetupPIN = async () => {
    if (newPIN !== confirmPINValue) {
      toast.error('PINs do not match');
      return;
    }
    if (newPIN.length < 4) {
      toast.error('PIN must be at least 4 digits');
      return;
    }
    try {
      await setupPIN(newPIN);
      setNewPIN('');
      setConfirmPINValue('');
      setHasPIN(true);
      await refreshUser();
      toast.success('Security PIN configured!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to setup PIN');
    }
  };

  const handleChangePassword = async () => {
    if (newPass.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    try {
      await changePassword({ current_password: currentPass, new_password: newPass });
      setCurrentPass('');
      setNewPass('');
      toast.success('Password changed successfully!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to change password');
    }
  };

  const handleTrustDevice = async () => {
    const nav = window.navigator;
    const raw = [nav.userAgent, nav.language, nav.platform, screen.width, screen.height, new Date().getTimezoneOffset()].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    const fp = Math.abs(hash).toString(16);
    try {
      await trustDevice({ device_fingerprint: fp, device_name: nav.platform || 'Browser' });
      await loadData();
      toast.success('Device trusted');
    } catch {
      toast.error('Failed to trust device');
    }
  };

  const handleRemoveDevice = async (deviceId) => {
    try {
      await removeDevice(deviceId);
      setDevices(devices.filter(d => d.id !== deviceId));
      toast.success('Device removed');
    } catch {
      toast.error('Failed to remove device');
    }
  };

  const sections = [
    { id: 'locks', label: 'Identification Locks', icon: Lock },
    { id: 'totp', label: 'Authenticator', icon: QrCode },
    { id: 'pin', label: 'Security PIN', icon: NumberSquareNine },
    { id: 'devices', label: 'Trusted Devices', icon: Desktop },
    { id: 'password', label: 'Password', icon: LockKey },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#030303' }}>
        <div className="font-mono text-[#10B981] text-sm animate-pulse">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#030303' }}>
      {/* Header */}
      <header className="border-b border-[#10B981]/20 bg-[#0A0A0A]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <button data-testid="settings-back-button" onClick={() => onNavigate('dashboard')} className="text-[#9CA3AF] hover:text-[#10B981] transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={20} weight="duotone" className="text-[#10B981]" />
            <span className="font-mono text-base font-bold tracking-tighter">Security Settings</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1">
            <nav className="space-y-1" data-testid="settings-nav">
              {sections.map(s => (
                <button
                  key={s.id}
                  data-testid={`settings-section-${s.id}`}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 font-mono text-xs rounded-sm transition-all text-left ${
                    activeSection === s.id
                      ? 'bg-[#10B981]/10 border border-[#10B981]/40 text-[#10B981]'
                      : 'text-[#9CA3AF] hover:text-[#F9FAFB] border border-transparent hover:border-[#10B981]/10'
                  }`}
                >
                  <s.icon size={16} />{s.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="md:col-span-3">
            {/* Identification Locks */}
            {activeSection === 'locks' && (
              <div className="terminal-card p-6 animate-fade-in" data-testid="locks-section">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB] mb-1">Identification Locks</h3>
                <p className="font-sans text-xs text-[#4B5563] mb-6">Configure which security locks are required during login</p>
                <div className="space-y-4">
                  <LockToggle label="Email OTP" description="Receive a one-time code via email" active={lockConfig.otp_enabled} onToggle={(v) => handleToggleLock('otp_enabled', v)} testId="toggle-otp" />
                  <LockToggle label="TOTP Authenticator" description="Use Google Authenticator or similar app" active={lockConfig.totp_enabled} onToggle={(v) => handleToggleLock('totp_enabled', v)} disabled={!hasTOTP} testId="toggle-totp" />
                  <LockToggle label="Security PIN" description="Enter a personal identification number" active={lockConfig.pin_enabled} onToggle={(v) => handleToggleLock('pin_enabled', v)} disabled={!hasPIN} testId="toggle-pin" />
                  <LockToggle label="Device Lock" description="Require verification from untrusted devices" active={lockConfig.device_lock_enabled} onToggle={(v) => handleToggleLock('device_lock_enabled', v)} testId="toggle-device" />
                </div>
              </div>
            )}

            {/* TOTP Setup */}
            {activeSection === 'totp' && (
              <div className="terminal-card p-6 animate-fade-in" data-testid="totp-section">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB] mb-1">Authenticator App</h3>
                <p className="font-sans text-xs text-[#4B5563] mb-6">
                  {hasTOTP ? 'Your authenticator is configured.' : 'Set up a TOTP authenticator for extra security.'}
                </p>
                {hasTOTP ? (
                  <div className="flex items-center gap-2 p-3 bg-[#10B981]/10 border border-[#10B981]/30 rounded-sm">
                    <Check size={18} className="text-[#10B981]" />
                    <span className="font-mono text-xs text-[#10B981]">Authenticator Active</span>
                  </div>
                ) : totpSetup ? (
                  <div className="space-y-4">
                    <div className="flex justify-center p-4 bg-white rounded-sm">
                      <img src={totpSetup.qr_code} alt="QR Code" className="w-48 h-48" data-testid="totp-qr-code" />
                    </div>
                    <div className="p-3 bg-[#0F1115] border border-[#10B981]/10 rounded-sm">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#4B5563] mb-1">Secret Key</p>
                      <p className="font-mono text-xs text-[#10B981] break-all" data-testid="totp-secret">{totpSetup.secret}</p>
                    </div>
                    <div>
                      <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">Verify Code</label>
                      <input
                        data-testid="totp-setup-code-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={totpVerifyCode}
                        onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                        className="terminal-input"
                        placeholder="Enter 6-digit code"
                      />
                    </div>
                    <button data-testid="confirm-totp-setup" onClick={handleConfirmTOTP} className="btn-primary w-full py-2">Confirm & Activate</button>
                  </div>
                ) : (
                  <button data-testid="setup-totp-button" onClick={handleSetupTOTP} className="btn-primary py-2 px-4">
                    Setup Authenticator
                  </button>
                )}
              </div>
            )}

            {/* PIN Setup */}
            {activeSection === 'pin' && (
              <div className="terminal-card p-6 animate-fade-in" data-testid="pin-section">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB] mb-1">Security PIN</h3>
                <p className="font-sans text-xs text-[#4B5563] mb-6">
                  {hasPIN ? 'Your PIN is set. You can update it below.' : 'Set a 4-8 digit personal identification number.'}
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">{hasPIN ? 'New PIN' : 'PIN'}</label>
                    <input
                      data-testid="pin-setup-input"
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={newPIN}
                      onChange={(e) => setNewPIN(e.target.value.replace(/\D/g, ''))}
                      className="terminal-input"
                      placeholder="Enter 4-8 digit PIN"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">Confirm PIN</label>
                    <input
                      data-testid="pin-confirm-input"
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      value={confirmPINValue}
                      onChange={(e) => setConfirmPINValue(e.target.value.replace(/\D/g, ''))}
                      className="terminal-input"
                      placeholder="Confirm PIN"
                    />
                  </div>
                  <button data-testid="save-pin-button" onClick={handleSetupPIN} className="btn-primary py-2 px-4">
                    {hasPIN ? 'Update PIN' : 'Set PIN'}
                  </button>
                </div>
              </div>
            )}

            {/* Trusted Devices */}
            {activeSection === 'devices' && (
              <div className="terminal-card p-6 animate-fade-in" data-testid="devices-section">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB] mb-1">Trusted Devices</h3>
                    <p className="font-sans text-xs text-[#4B5563]">Manage devices that can bypass device verification</p>
                  </div>
                  <button data-testid="trust-current-device" onClick={handleTrustDevice} className="btn-primary py-1.5 px-3 text-[10px]">
                    Trust This Device
                  </button>
                </div>
                <div className="space-y-3">
                  {devices.map(device => (
                    <div key={device.id} className="flex items-center justify-between p-3 bg-[#0F1115] border border-[#10B981]/10 rounded-sm" data-testid={`device-${device.id}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <Fingerprint size={14} className="text-[#10B981]" />
                          <span className="font-mono text-xs text-[#F9FAFB]">{device.device_name}</span>
                        </div>
                        <p className="font-mono text-[10px] text-[#4B5563] mt-1">
                          FP: {device.device_fingerprint?.slice(0, 12)}... | Trusted: {new Date(device.trusted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button data-testid={`remove-device-${device.id}`} onClick={() => handleRemoveDevice(device.id)} className="text-[#EF4444]/50 hover:text-[#EF4444] transition-colors">
                        <Trash size={16} />
                      </button>
                    </div>
                  ))}
                  {devices.length === 0 && <p className="font-mono text-xs text-[#4B5563]">No trusted devices</p>}
                </div>
              </div>
            )}

            {/* Password Change */}
            {activeSection === 'password' && (
              <div className="terminal-card p-6 animate-fade-in" data-testid="password-section">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB] mb-1">Change Password</h3>
                <p className="font-sans text-xs text-[#4B5563] mb-6">Update your account password</p>
                <div className="space-y-4">
                  <div>
                    <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">Current Password</label>
                    <div className="relative">
                      <input
                        data-testid="current-password-input"
                        type={showPasswords ? 'text' : 'password'}
                        value={currentPass}
                        onChange={(e) => setCurrentPass(e.target.value)}
                        className="terminal-input pr-8"
                        placeholder="Enter current password"
                      />
                      <button type="button" onClick={() => setShowPasswords(!showPasswords)} className="absolute right-0 top-1/2 -translate-y-1/2 text-[#4B5563] hover:text-[#10B981]">
                        {showPasswords ? <EyeSlash size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="font-mono text-xs uppercase tracking-[0.15em] text-[#9CA3AF] block mb-2">New Password</label>
                    <input
                      data-testid="new-password-input"
                      type={showPasswords ? 'text' : 'password'}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="terminal-input"
                      placeholder="Enter new password (min 8 chars)"
                    />
                  </div>
                  <button data-testid="change-password-button" onClick={handleChangePassword} className="btn-primary py-2 px-4">
                    Update Password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LockToggle({ label, description, active, onToggle, disabled = false, testId }) {
  return (
    <div className={`flex items-center justify-between p-3 bg-[#0F1115] border rounded-sm transition-all ${active ? 'border-[#10B981]/30' : 'border-[#10B981]/10'} ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className="font-mono text-xs text-[#F9FAFB]">{label}</p>
        <p className="font-sans text-[10px] text-[#4B5563] mt-0.5">{description}</p>
        {disabled && <p className="font-mono text-[10px] text-[#F59E0B] mt-0.5">Setup required first</p>}
      </div>
      <button
        data-testid={testId}
        onClick={() => !disabled && onToggle(!active)}
        className={`w-10 h-5 rounded-full transition-all relative ${active ? 'bg-[#10B981]' : 'bg-[#4B5563]'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-[#030303] absolute top-0.5 transition-all ${active ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
