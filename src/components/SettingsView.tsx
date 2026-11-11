import React, { useEffect, useState } from 'react';
import { UserRole } from '../types';
import { Language, translations } from '../i18n';
import {
  Sliders,
  Download,
  Database,
  Clock,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Server,
} from 'lucide-react';
import { apiRequest } from '../api';

interface SettingsViewProps {
  userRole: UserRole;
  lang: Language;
}

interface BookingSafetyRules {
  waiver_valid_days: number;
  minimum_deposit_percent: number;
  max_divers_per_buoy: number;
  ras_mohamed_min_participants: number;
}

function isBookingSafetyRules(value: unknown): value is BookingSafetyRules {
  if (!value || typeof value !== 'object') return false;
  const rules = value as Record<string, unknown>;
  return typeof rules.waiver_valid_days === 'number' &&
    Number.isInteger(rules.waiver_valid_days) &&
    rules.waiver_valid_days >= 1 &&
    rules.waiver_valid_days <= 3650 &&
    typeof rules.minimum_deposit_percent === 'number' &&
    Number.isFinite(rules.minimum_deposit_percent) &&
    rules.minimum_deposit_percent >= 1 &&
    rules.minimum_deposit_percent <= 100 &&
    typeof rules.max_divers_per_buoy === 'number' &&
    Number.isInteger(rules.max_divers_per_buoy) &&
    rules.max_divers_per_buoy >= 1 &&
    rules.max_divers_per_buoy <= 10 &&
    typeof rules.ras_mohamed_min_participants === 'number' &&
    Number.isInteger(rules.ras_mohamed_min_participants) &&
    rules.ras_mohamed_min_participants >= 1 &&
    rules.ras_mohamed_min_participants <= 100;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userRole,
  lang,
}) => {
  const t = translations[lang];
  const isOwner = userRole === 'owner';
  const [downloading, setDownloading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    timezone: 'Africa/Cairo',
    center_name: 'Freedive Dahab',
    currency_primary: 'EUR',
    currency_secondary: 'EGP',
    default_vat_rate: '0.00',
    dive_sites: 'Blue Hole, Lighthouse Bay, Eel Garden, The Canyon, The Bells, Ras Abu Galum',
  });
  const [bookingSafetyRules, setBookingSafetyRules] = useState<BookingSafetyRules>({
    waiver_valid_days: 365,
    minimum_deposit_percent: 30,
    max_divers_per_buoy: 3,
    ras_mohamed_min_participants: 4,
  });

  useEffect(() => {
    let active = true;
    apiRequest<Record<string, string>>('/api/settings')
      .then((storedSettings) => {
        if (!active) return;
        setSettings((current) => ({
          timezone: storedSettings.timezone || current.timezone,
          center_name: storedSettings.center_name || current.center_name,
          currency_primary: storedSettings.currency_primary || current.currency_primary,
          currency_secondary: storedSettings.currency_secondary || current.currency_secondary,
          default_vat_rate: storedSettings.default_vat_rate || current.default_vat_rate,
          dive_sites: storedSettings.dive_sites || current.dive_sites,
        }));
        if (storedSettings.booking_safety_rules) {
          const parsed: unknown = JSON.parse(storedSettings.booking_safety_rules);
          if (isBookingSafetyRules(parsed)) {
            setBookingSafetyRules(parsed);
          } else {
            setSettingsError('Saved booking safety rules are invalid. An owner must correct them before bookings can proceed.');
          }
        }
      })
      .catch((err: Error) => {
        if (active) setSettingsError(err.message || 'Failed to load system settings');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleExportBackup = async () => {
    setDownloading(true);
    try {
      const data = await apiRequest('/api/backup/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `freedive_dahab_erp_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Backup export failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    try {
      await apiRequest('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            ...settings,
            booking_safety_rules: bookingSafetyRules,
          },
        }),
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setSettingsError(err.message || 'Failed to save settings');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="pb-2 border-b border-[#E8EEF7] dark:border-slate-800">
        <h2 className="text-xl font-black text-[#28334E] dark:text-white flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#4C8BF5]" />
          <span>System Settings & Operational Configuration</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Timezone parameters, billing currencies, dive site spots, and persistent database backups.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>System configuration updated successfully on server.</span>
        </div>
      )}
      {settingsError && (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          {settingsError}
        </p>
      )}

      {/* Settings Form */}
      <form onSubmit={handleSaveSettings} className="bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl p-6 space-y-5 text-xs shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E8EEF7] dark:border-slate-800">
          <Clock className="w-4 h-4 text-[#4C8BF5]" />
          <h3 className="text-sm font-extrabold text-[#28334E] dark:text-white">Regional & Operational Parameters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Center Display Name</label>
            <input
              type="text"
              disabled={!isOwner}
              value={settings.center_name}
              onChange={(e) => setSettings({ ...settings, center_name: e.target.value })}
              className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] disabled:opacity-60"
            />
          </div>

          <section className="space-y-4 border-t border-[#E8EEF7] dark:border-slate-800 pt-5" aria-labelledby="booking-safety-settings-heading">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-500" />
              <h3 id="booking-safety-settings-heading" className="text-sm font-extrabold text-[#28334E] dark:text-white">
                Booking Safety Gate
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              These owner-managed thresholds are enforced by the server before course bookings are confirmed.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="waiver-valid-days" className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Waiver validity (days)</label>
                <input
                  id="waiver-valid-days"
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  disabled={!isOwner}
                  value={bookingSafetyRules.waiver_valid_days}
                  onChange={(event) => setBookingSafetyRules({ ...bookingSafetyRules, waiver_valid_days: Number(event.target.value) })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="minimum-deposit-percent" className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Minimum deposit (%)</label>
                <input
                  id="minimum-deposit-percent"
                  type="number"
                  min={1}
                  max={100}
                  step={0.1}
                  disabled={!isOwner}
                  value={bookingSafetyRules.minimum_deposit_percent}
                  onChange={(event) => setBookingSafetyRules({ ...bookingSafetyRules, minimum_deposit_percent: Number(event.target.value) })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="max-divers-per-buoy" className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Maximum divers per buoy</label>
                <input
                  id="max-divers-per-buoy"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  disabled={!isOwner}
                  value={bookingSafetyRules.max_divers_per_buoy}
                  onChange={(event) => setBookingSafetyRules({ ...bookingSafetyRules, max_divers_per_buoy: Number(event.target.value) })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="ras-min-participants" className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Ras Mohamed minimum participants</label>
                <input
                  id="ras-min-participants"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  disabled={!isOwner}
                  value={bookingSafetyRules.ras_mohamed_min_participants}
                  onChange={(event) => setBookingSafetyRules({ ...bookingSafetyRules, ras_mohamed_min_participants: Number(event.target.value) })}
                  className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60"
                />
              </div>
            </div>
          </section>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Configured Timezone</label>
            <select
              disabled={!isOwner}
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] disabled:opacity-60"
            >
              <option value="Africa/Cairo">Africa/Cairo (Egypt EET/EEST UTC+2/3)</option>
              <option value="UTC">UTC (Universal Coordinated Time)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Primary Currency</label>
            <input
              type="text"
              disabled={!isOwner}
              value={settings.currency_primary}
              onChange={(e) => setSettings({ ...settings, currency_primary: e.target.value })}
              className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] font-mono disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Secondary Currency</label>
            <input
              type="text"
              disabled={!isOwner}
              value={settings.currency_secondary}
              onChange={(e) => setSettings({ ...settings, currency_secondary: e.target.value })}
              className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] font-mono disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Reviewable VAT Rate (%)</label>
            <input
              type="text"
              disabled={!isOwner}
              value={settings.default_vat_rate}
              onChange={(e) => setSettings({ ...settings, default_vat_rate: e.target.value })}
              className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] font-mono disabled:opacity-60"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">Active Dahab Dive Locations</label>
          <input
            type="text"
            disabled={!isOwner}
            value={settings.dive_sites}
            onChange={(e) => setSettings({ ...settings, dive_sites: e.target.value })}
            className="w-full bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-[#4C8BF5] disabled:opacity-60"
          />
        </div>

        {isOwner && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#4C8BF5] hover:bg-[#3B7BE8] text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              Save Regional Settings
            </button>
          </div>
        )}
      </form>

      {/* Database Backup & Disaster Recovery Section */}
      <div className="bg-white dark:bg-[#1E293B] border border-[#E8EEF7] dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E8EEF7] dark:border-slate-800">
          <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-extrabold text-[#28334E] dark:text-white">Persistent Storage & Backup Protocol</h3>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          The ERP system uses an atomic, transactional SQLite storage engine running with Write-Ahead Logging (<code className="font-mono text-[#4C8BF5] font-bold">WAL mode</code>) and strict foreign key integrity. To safeguard customer billing, student dossiers, and payroll registers, Center Owners can download a complete JSON database snapshot at any time.
        </p>

        <div className="p-4 rounded-xl bg-[#F4F6FA] dark:bg-[#071322] border border-[#E8EEF7] dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">Full System Export Snapshot</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Includes all students, CRM inquiries, courses, schedules, invoices, payments, expenses, equipment inventory, and audit logs.
              </div>
            </div>

            {isOwner ? (
              <button
                onClick={handleExportBackup}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 cursor-pointer transition-colors whitespace-nowrap self-start sm:self-auto"
              >
                <Download className="w-4 h-4" />
                <span>{downloading ? 'Exporting...' : 'Export Snapshot (.json)'}</span>
              </button>
            ) : (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold italic">
                Export restricted to Center Owner role.
              </span>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
          <strong className="text-slate-700 dark:text-slate-300">Recommended Backup Best Practice:</strong>
          <ul className="list-disc list-inside space-y-0.5 ml-1">
            <li>Download a database snapshot at the end of each monthly payroll cycle.</li>
            <li>Store backup archives in an encrypted external storage volume.</li>
            <li>Verify invoice numbers and payment reconciliations before clearing seasonal records.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
