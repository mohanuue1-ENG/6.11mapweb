import React, { useState } from 'react';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import { errorMessage } from '../../services/api';
import { ErrorBanner, Field, Modal, primaryButton, useFieldClass } from '../../components/common/ui';
import { COUNTRIES, flag, joinPhone, splitPhone } from '../../data/countries';
import {
  Users,
  PlusCircle,
  Edit2,
  Trash2,
  PowerOff,
  Power,
  Search,
  Truck,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  X
} from 'lucide-react';

export default function Drivers() {
  const { drivers, trucks, addDriver, updateDriver, deleteDriver, fleetLoading, fleetError } = useGps();
  const { isDark } = useTheme();
  const field = useFieldClass();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    phoneDial: '1',
    phoneNational: '',
    assignedTruckId: '',
  });

  const openAddModal = () => {
    setEditingDriver(null);
    setFormData({
      phoneDial: '1',
      phoneNational: '',
      assignedTruckId: '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (driver) => {
    setEditingDriver(driver);
    const parts = splitPhone(driver.phone);
    setFormData({
      phoneDial: parts.dial,
      phoneNational: parts.national,
      assignedTruckId: driver.assignedTruckId || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    const phone = joinPhone(formData.phoneDial, formData.phoneNational);
    if (phone.replace(/\D/g, '').length < 7) {
      setFormError('Add the driver’s phone number. The driver enters it in the app to create their own account.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (editingDriver) {
        await updateDriver(editingDriver.id, { phone, assignedTruckId: formData.assignedTruckId });
      } else {
        await addDriver({ phone, assignedTruckId: formData.assignedTruckId });
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the driver.'));
    } finally {
      setSaving(false);
    }
  };

  // Row actions report failures (trip in progress, history…) above the table.
  const runRowAction = async (action, fallback) => {
    setPageError('');
    try {
      await action();
    } catch (err) {
      setPageError(errorMessage(err, fallback));
    }
  };

  const toggleDriverStatus = (driver) =>
    runRowAction(
      () => updateDriver(driver.id, { status: driver.status === 'active' ? 'inactive' : 'active' }),
      'Could not change the driver status.',
    );

  const handleDelete = (driver) => {
    if (!window.confirm(`Delete driver ${driver.name}? Their mobile login is removed too. This cannot be undone.`)) return;
    runRowAction(() => deleteDriver(driver.id), 'Could not delete the driver.');
  };

  const filteredDrivers = drivers.filter((d) => {
    return (
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.phone || '').includes(searchQuery)
    );
  });

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Top Banner */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl border transition-colors ${
        isDark ? 'bg-[#0B0F14] border-white/10 text-white' : 'bg-white border-gray-200 text-[#111827] shadow-sm'
      }`}>
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-green" />
            Driver Management
          </h1>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Phone • Assign Truck • Mobile Account • GPS Status
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-green text-black hover:bg-brand-green-hover transition-all flex items-center gap-2 shadow-md shadow-brand-green/20"
        >
          <PlusCircle className="w-4 h-4" /> Add New Driver
        </button>
      </div>

      {(pageError || fleetError) && (
        <div role="alert" className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{(pageError || fleetError)}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-colors ${
        isDark ? 'bg-[#0B0F14] border-white/10' : 'bg-white border-gray-200 shadow-sm'
      }`}>
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full rounded-xl pl-9 pr-3 py-2 text-xs border focus:outline-none focus:border-brand-green transition-colors ${
              isDark
                ? 'bg-[#111827] border-white/10 text-white placeholder-gray-500'
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
            }`}
          />
        </div>

        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Total Registered Drivers: <span className="text-brand-green font-bold">{drivers.length}</span>
        </div>
      </div>

      {/* Drivers Table */}
      <div className={`rounded-3xl border overflow-hidden shadow-xl transition-colors ${
        isDark ? 'border-white/10 bg-[#0B0F14] text-white' : 'border-gray-200 bg-white text-[#111827]'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b text-[11px] uppercase tracking-wider ${
                isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}>
                <th className="py-3.5 px-4 font-semibold">Driver Name</th>
                <th className="py-3.5 px-4 font-semibold">Phone Number</th>
                <th className="py-3.5 px-4 font-semibold">Assigned Truck</th>
                <th className="py-3.5 px-4 font-semibold">Mobile App Account</th>
                <th className="py-3.5 px-4 font-semibold">GPS status</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
              {filteredDrivers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center text-gray-400">
                    {fleetLoading ? 'Loading drivers…' : drivers.length === 0 ? 'No drivers yet. Add your first driver to get started.' : 'No drivers match your search.'}
                  </td>
                </tr>
              )}
              {filteredDrivers.map((driver) => {
                const assignedTruck = trucks.find((t) => t.id === driver.assignedTruckId);
                return (
                  <tr key={driver.id} className="hover:bg-dark-surface2/50 transition-colors">
                    <td className="py-4 px-4 font-semibold text-sm dark:text-white light:text-gray-900">
                      {driver.hasLogin ? driver.name : <span className="text-gray-500 font-normal">Not signed up yet</span>}
                    </td>
                    <td className="py-4 px-4 font-mono text-mute">
                      {driver.phone || '—'}
                    </td>
                    <td className="py-4 px-4">
                      {assignedTruck ? (
                        <div className="flex items-center gap-1.5 font-mono text-xs dark:text-white light:text-gray-900 font-bold">
                          <Truck className="w-3.5 h-3.5 text-brand-green" />
                          #{assignedTruck.truckNumber}{assignedTruck.plateNumber ? ` (${assignedTruck.plateNumber})` : ''}
                        </div>
                      ) : (
                        <span className="text-gray-500 font-mono text-[11px]">Unassigned</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {driver.hasLogin ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-green/20 text-brand-green flex items-center gap-1 w-fit">
                          <Smartphone className="w-3 h-3" /> Registered
                        </span>
                      ) : (
                        <span className="text-amber-500 font-mono text-[10px]">Waiting to sign up</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          driver.gpsStatus === 'active'
                            ? 'bg-brand-green/20 text-brand-green'
                            : driver.gpsStatus === 'delayed'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        ● {driver.gpsStatus || 'offline'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          driver.status === 'active'
                            ? 'bg-brand-green/10 text-brand-green'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {driver.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(driver)}
                          title="Edit Driver"
                          className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-card transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleDriverStatus(driver)}
                          title={driver.status === 'active' ? 'Deactivate Driver' : 'Activate Driver'}
                          className={`p-1.5 rounded-lg border border-dark-border transition-colors ${
                            driver.status === 'active'
                              ? 'text-amber-400 hover:bg-amber-500/10'
                              : 'text-brand-green hover:bg-brand-green/10'
                          }`}
                        >
                          {driver.status === 'active' ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(driver)}
                          title="Delete Driver"
                          className="p-1.5 rounded-lg border border-dark-border text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Driver Modal */}
      {modalOpen && (
        <Modal title={editingDriver ? 'Edit driver' : 'Add driver'} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className='space-y-4'>
            <ErrorBanner message={formError} />
            <Field label='Phone number *'>
              <div className='flex gap-2'>
                <select
                  aria-label='Country code'
                  className={`${field} !w-auto max-w-[46%] shrink-0`}
                  value={formData.phoneDial}
                  onChange={(e) => setFormData({ ...formData, phoneDial: e.target.value })}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.dial}>
                      {flag(c.code)} {c.name} (+{c.dial})
                    </option>
                  ))}
                </select>
                <input
                  type='tel'
                  inputMode='tel'
                  className={field}
                  placeholder='555 123 4567'
                  value={formData.phoneNational}
                  onChange={(e) => setFormData({ ...formData, phoneNational: e.target.value })}
                />
              </div>
              <p className='text-[11px] text-mute mt-1'>The driver enters this phone number in the app to create their account.</p>
            </Field>

            <Field label='Assigned truck'>
              <select className={field} value={formData.assignedTruckId} onChange={(e) => setFormData({ ...formData, assignedTruckId: e.target.value })}>
                <option value=''>No truck assigned</option>
                {trucks.map((trk) => (
                  <option key={trk.id} value={trk.id}>
                    Truck #{trk.truckNumber} {[trk.plateNumber, trk.make, trk.model].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </Field>

            <p className='text-xs text-mute leading-relaxed'>
              {editingDriver?.hasLogin ? (
                <>This driver has an app account (<span className='font-semibold text-ink'>{editingDriver.email}</span>).</>
              ) : (
                'The driver opens the 6.11 BIS app, enters this phone number, then their name and Gmail, confirms the code sent to that email and chooses a password.'
              )}
            </p>

            <div className='flex justify-end gap-2 pt-1'>
              <button type='button' onClick={() => setModalOpen(false)} className='px-4 py-2 text-xs font-semibold rounded-xl border border-line text-mute hover:text-ink'>Cancel</button>
              <button type='submit' disabled={saving} className={primaryButton}>{saving ? 'Saving…' : editingDriver ? 'Save changes' : 'Add driver'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
