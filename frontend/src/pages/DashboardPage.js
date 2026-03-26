import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldWarning, SignOut, Gear, Desktop,
  ClockCounterClockwise, ChartLine, Lightning, Warning, Eye,
  Fingerprint, Lock, Pulse
} from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { getSecurityLogs, getSessions, revokeSession, getAnalytics, getThreats } from '../lib/api';
import { toast } from 'sonner';

const severityColors = {
  info: 'text-[#EC4899]',
  warning: 'text-[#F59E0B]',
  critical: 'text-[#EF4444]'
};

const severityBg = {
  info: 'bg-[#EC4899]/10 border-[#EC4899]/30',
  warning: 'bg-[#F59E0B]/10 border-[#F59E0B]/30',
  critical: 'bg-[#EF4444]/10 border-[#EF4444]/30'
};

export default function DashboardPage({ onNavigate }) {
  const { user, logoutUser } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [threats, setThreats] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, sessRes, analyticsRes, threatsRes] = await Promise.all([
        getSecurityLogs(),
        getSessions(),
        getAnalytics(),
        getThreats()
      ]);
      setLogs(logsRes.data.logs);
      setSessions(sessRes.data.sessions);
      setAnalytics(analyticsRes.data);
      setThreats(threatsRes.data);
    } catch (err) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRevokeSession = async (sessionId) => {
    try {
      await revokeSession(sessionId);
      toast.success('Session revoked');
      setSessions(sessions.filter(s => s.id !== sessionId));
    } catch {
      toast.error('Failed to revoke session');
    }
  };

  const threatScore = threats?.threat_score ?? 100;
  const scoreColor = threatScore >= 80 ? '#EC4899' : threatScore >= 50 ? '#F59E0B' : '#EF4444';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Shield },
    { id: 'logs', label: 'Logs', icon: ClockCounterClockwise },
    { id: 'sessions', label: 'Sessions', icon: Desktop },
    { id: 'analytics', label: 'Analytics', icon: ChartLine },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#030303' }}>
      {/* Header */}
      <header className="border-b border-[#EC4899]/20 bg-[#0A0A0A]/80 backdrop-blur-sm sticky top-0 z-50" data-testid="dashboard-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} weight="duotone" className="text-[#EC4899]" />
            <span className="font-mono text-lg font-bold tracking-tighter">LOCK<span className="text-[#EC4899]">BOX</span></span>
          </div>
          <div className="flex items-center gap-4">
            <button data-testid="settings-nav-button" onClick={() => onNavigate('settings')} className="p-2 text-[#9CA3AF] hover:text-[#EC4899] transition-colors">
              <Gear size={20} />
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#0F1115] border border-[#EC4899]/10 rounded-sm">
              <div className="w-2 h-2 rounded-full bg-[#EC4899]" />
              <span className="font-mono text-xs text-[#9CA3AF]">{user?.email}</span>
            </div>
            <button data-testid="logout-button" onClick={logoutUser} className="flex items-center gap-1.5 text-[#EF4444]/70 hover:text-[#EF4444] font-mono text-xs transition-colors">
              <SignOut size={16} /><span className="hidden sm:inline">LOGOUT</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2" data-testid="dashboard-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-wider rounded-sm transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#EC4899]/10 border border-[#EC4899]/50 text-[#EC4899]'
                  : 'border border-transparent text-[#4B5563] hover:text-[#9CA3AF] hover:border-[#EC4899]/10'
              }`}
            >
              <tab.icon size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="font-mono text-[#EC4899] text-sm animate-pulse">Loading secure data...</div>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6 animate-fade-in" data-testid="overview-panel">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard icon={ShieldCheck} label="Security Score" value={`${threatScore}%`} valueColor={scoreColor} />
                  <StatCard icon={Pulse} label="Login Attempts" value={analytics?.total_attempts || 0} subtext={`${analytics?.failed || 0} failed`} />
                  <StatCard icon={Desktop} label="Active Sessions" value={sessions.length} />
                  <StatCard icon={Warning} label="Threats Detected" value={threats?.recent_count || 0} valueColor={threats?.recent_count > 0 ? '#EF4444' : '#EC4899'} />
                </div>

                {/* Threat Score Visual */}
                <div className="terminal-card p-6" data-testid="threat-score-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightning size={18} className="text-[#EC4899]" />
                    <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB]">Security Posture</h3>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="relative w-24 h-24 flex-shrink-0">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="#0F1115" strokeWidth="8" />
                        <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="8"
                          strokeDasharray={`${threatScore * 2.64} 264`} strokeLinecap="butt" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-mono text-lg font-bold" style={{ color: scoreColor }}>{threatScore}</span>
                      </div>
                    </div>
                    <div className="space-y-2 flex-1">
                      <SecurityItem label="OTP Verification" active={user?.lock_config?.otp_enabled} />
                      <SecurityItem label="TOTP Authenticator" active={user?.lock_config?.totp_enabled} />
                      <SecurityItem label="Security PIN" active={user?.lock_config?.pin_enabled} />
                      <SecurityItem label="Device Lock" active={user?.lock_config?.device_lock_enabled} />
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="terminal-card p-6" data-testid="recent-activity-card">
                  <div className="flex items-center gap-2 mb-4">
                    <ClockCounterClockwise size={18} className="text-[#EC4899]" />
                    <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB]">Recent Activity</h3>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {logs.slice(0, 8).map((log, i) => (
                      <LogEntry key={log.id || i} log={log} />
                    ))}
                    {logs.length === 0 && <p className="font-mono text-xs text-[#4B5563]">No activity recorded yet</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="terminal-card p-6 animate-fade-in" data-testid="logs-panel">
                <div className="flex items-center gap-2 mb-4">
                  <Eye size={18} className="text-[#EC4899]" />
                  <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB]">Security Event Log</h3>
                  <span className="font-mono text-xs text-[#4B5563] ml-auto">{logs.length} events</span>
                </div>
                <div className="space-y-1 max-h-[600px] overflow-y-auto">
                  {logs.map((log, i) => (
                    <LogEntry key={log.id || i} log={log} detailed />
                  ))}
                  {logs.length === 0 && <p className="font-mono text-xs text-[#4B5563]">No events recorded</p>}
                </div>
              </div>
            )}

            {/* Sessions Tab */}
            {activeTab === 'sessions' && (
              <div className="terminal-card p-6 animate-fade-in" data-testid="sessions-panel">
                <div className="flex items-center gap-2 mb-4">
                  <Desktop size={18} className="text-[#EC4899]" />
                  <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB]">Active Sessions</h3>
                  <span className="font-mono text-xs text-[#4B5563] ml-auto">{sessions.length} active</span>
                </div>
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-3 bg-[#0F1115] border border-[#EC4899]/10 rounded-sm" data-testid={`session-${session.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Fingerprint size={14} className="text-[#EC4899]" />
                          <span className="font-mono text-xs text-[#F9FAFB]">{session.ip_address || 'Unknown IP'}</span>
                        </div>
                        <p className="font-mono text-[10px] text-[#4B5563]">
                          Created: {new Date(session.created_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        data-testid={`revoke-session-${session.id}`}
                        onClick={() => handleRevokeSession(session.id)}
                        className="btn-danger text-xs py-1 px-3"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                  {sessions.length === 0 && <p className="font-mono text-xs text-[#4B5563]">No active sessions</p>}
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && analytics && (
              <div className="space-y-6 animate-fade-in" data-testid="analytics-panel">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard icon={ChartLine} label="Total Attempts" value={analytics.total_attempts} />
                  <StatCard icon={ShieldCheck} label="Successful" value={analytics.successful} valueColor="#EC4899" />
                  <StatCard icon={ShieldWarning} label="Failed" value={analytics.failed} valueColor="#EF4444" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatCard icon={Fingerprint} label="Unique Devices" value={analytics.unique_devices} />
                  <StatCard icon={Lock} label="Unique IPs" value={analytics.unique_ips} />
                </div>

                {/* Daily Activity Chart */}
                <div className="terminal-card p-6" data-testid="daily-activity-chart">
                  <h3 className="font-mono text-sm uppercase tracking-wider text-[#F9FAFB] mb-4">Daily Login Activity</h3>
                  <div className="space-y-2">
                    {analytics.daily_stats.slice(-7).map((day) => {
                      const total = day.success + day.failed;
                      const maxVal = Math.max(...analytics.daily_stats.map(d => d.success + d.failed), 1);
                      return (
                        <div key={day.date} className="flex items-center gap-3">
                          <span className="font-mono text-[10px] text-[#4B5563] w-20 flex-shrink-0">{day.date.slice(5)}</span>
                          <div className="flex-1 h-4 bg-[#0F1115] rounded-sm overflow-hidden flex">
                            <div className="h-full bg-[#EC4899]/40" style={{ width: `${(day.success / maxVal) * 100}%` }} />
                            <div className="h-full bg-[#EF4444]/40" style={{ width: `${(day.failed / maxVal) * 100}%` }} />
                          </div>
                          <span className="font-mono text-[10px] text-[#9CA3AF] w-8 text-right">{total}</span>
                        </div>
                      );
                    })}
                    {analytics.daily_stats.length === 0 && <p className="font-mono text-xs text-[#4B5563]">No data available</p>}
                  </div>
                  <div className="flex gap-4 mt-3 font-mono text-[10px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#EC4899]/40 inline-block" /> Success</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#EF4444]/40 inline-block" /> Failed</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtext, valueColor = '#F9FAFB' }) {
  return (
    <div className="terminal-card p-4" data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-[#EC4899]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#4B5563]">{label}</span>
      </div>
      <div className="font-mono text-2xl font-bold" style={{ color: valueColor }}>{value}</div>
      {subtext && <p className="font-mono text-[10px] text-[#9CA3AF] mt-1">{subtext}</p>}
    </div>
  );
}

function SecurityItem({ label, active }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#EC4899]' : 'bg-[#4B5563]'}`} />
      <span className={`font-mono text-xs ${active ? 'text-[#EC4899]' : 'text-[#4B5563]'}`}>{label}</span>
      <span className={`font-mono text-[10px] ml-auto ${active ? 'text-[#EC4899]' : 'text-[#4B5563]'}`}>
        {active ? 'ACTIVE' : 'INACTIVE'}
      </span>
    </div>
  );
}

function LogEntry({ log, detailed = false }) {
  const time = new Date(log.timestamp).toLocaleString();
  return (
    <div className={`log-entry flex items-start gap-3 p-2 rounded-sm border ${severityBg[log.severity] || severityBg.info}`} data-testid={`log-${log.id}`}>
      <div className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${log.severity === 'critical' ? 'bg-[#EF4444]' : log.severity === 'warning' ? 'bg-[#F59E0B]' : 'bg-[#EC4899]'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-mono text-xs font-medium ${severityColors[log.severity] || 'text-[#EC4899]'}`}>
            {log.event_type}
          </span>
          <span className="font-mono text-[10px] text-[#4B5563]">{time}</span>
        </div>
        <p className="font-sans text-xs text-[#9CA3AF] mt-0.5 truncate">{log.details}</p>
        {detailed && log.ip_address && (
          <p className="font-mono text-[10px] text-[#4B5563] mt-0.5">IP: {log.ip_address}</p>
        )}
      </div>
    </div>
  );
}
