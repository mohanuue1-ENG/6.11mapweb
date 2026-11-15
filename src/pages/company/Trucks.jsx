import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from '../../components/common/ui';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import { errorMessage } from '../../services/api';
import {
  Truck,
  PlusCircle,
  Edit2,
  Trash2,
  PowerOff,
  Power,
  Search,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';

// The truck form's frame: on <body>, scrollable, above the header (see Modal in common/ui.jsx).
function TruckDialogFrame({ onClose, children }) {
  useDialogBehavior(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[10000] overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">{children}</div>
    </div>,
    document.body,
  );
}

export default function Trucks() {
  const { trucks, drivers, addTruck, updateTruck, deleteTruck, fleetLoading, fleetError } = useGps();
  const { isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pageError, setPageError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    truckNumber: '',
    plateNumber: '',
    make: '',
    model: '',
    year: '',
    vin: '',
    assignedDriverId: '',
  });

  const openAddModal = () => {
    setEditingTruck(null);
    setFormData({
      truckNumber: '',
      plateNumber: '',
      make: '',
      model: '',
      year: '',
      vin: '',
      assignedDriverId: '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (truck) => {
    setEditingTruck(truck);
    setFormData({
      truckNumber: truck.truckNumber,
      plateNumber: truck.plateNumber,
      make: truck.make,
      model: truck.model,
      year: truck.year ?? '',
      vin: truck.vin || '',
      assignedDriverId: truck.assignedDriverId || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving || !formData.truckNumber) return;
    setSaving(true);
    setFormError('');
    try {
      if (editingTruck) {
        await updateTruck(editingTruck.id, formData);
      } else {
        await addTruck(formData);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the truck.'));
    } finally {
      setSaving(false);
    }
  };

  // Row actions report failures (plan limit, trip in progressâ€¦) above the table.
  const runRowAction = async (action, fallback) => {
    setPageError('');
    try {
      await action();
    } catch (err) {
      setPageError(errorMessage(err, fallback));
    }
  };

  const toggleTruckStatus = (truck) =>
    runRowAction(
      () => updateTruck(truck.id, { status: truck.status === 'inactive' ? 'active' : 'inactive' }),
      'Could not change the truck status.',
    );

  const handleDelete = (truck) => {
    if (!window.confirm(`Delete truck #${truck.truckNumber}? This cannot be undone.`)) return;
    runRowAction(() => deleteTruck(truck.id), 'Could not delete the truck.');
  };

  const filteredTrucks = trucks.filter((t) => {
    return (
      t.truckNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.vin && t.vin.toLowerCase().includes(searchQuery.toLowerCase()))
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
            <Truck className="w-6 h-6 text-brand-green" />
            Truck Fleet Management
          </h1>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Truck Number â€¢ Plate â€¢ VIN â€¢ Driver Assignment â€¢ Activation Controls
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 text-xs font-bold rounded-xl bg-brand-green text-black hover:bg-brand-green-hover transition-all flex items-center gap-2 shadow-md shadow-brand-green/20"
        >
          <PlusCircle className="w-4 h-4" /> Add New Truck
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
            placeholder="Search by Truck #, Plate, VIN, Model..."
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
          Total Fleet Units: <span className="text-brand-green font-bold">{trucks.length}</span>
        </div>
      </div>

      {/* Trucks Table */}
      <div className={`rounded-3xl border overflow-hidden shadow-xl transition-colors ${
        isDark ? 'border-white/10 bg-[#0B0F14] text-white' : 'border-gray-200 bg-white text-[#111827]'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b text-[11px] uppercase tracking-wider ${
                isDark ? 'border-white/10 bg-white/[0.02] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}>
                <th className="py-3.5 px-4 font-semibold">Truck #</th>
                <th className="py-3.5 px-4 font-semibold">Plate Number</th>
                <th className="py-3.5 px-4 font-semibold">Make / Model / Year</th>
                <th className="py-3.5 px-4 font-semibold">VIN</th>
                <th className="py-3.5 px-4 font-semibold">Assigned Driver</th>
                <th className="py-3.5 px-4 font-semibold">GPS status</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
              {filteredTrucks.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 px-4 text-center text-gray-400">
                    {fleetLoading ? 'Loading trucksâ€¦' : trucks.length === 0 ? 'No trucks yet. Add your first truck to get started.' : 'No trucks match your search.'}
                  </td>
                </tr>
              )}
              {filteredTrucks.map((truck) => {
                const driver = drivers.find((d) => d.id === truck.assignedDriverId);
                return (
                  <tr key={truck.id} className="hover:bg-dark-surface2/50 transition-colors">
                    <td className="py-4 px-4 font-mono font-extrabold text-base text-brand-green">
                      #{truck.truckNumber}
                    </td>
                    <td className="py-4 px-4 font-mono font-semibold dark:text-white light:text-gray-900">
                      {truck.plateNumber}
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-medium dark:text-gray-200 light:text-gray-800">
                        {truck.make} {truck.model}
                      </div>
                      {truck.year && <div className="text-[10px] text-gray-400 font-mono">Year: {truck.year}</div>}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-gray-400">
                      {truck.vin || 'N/A'}
                    </td>
                    <td className="py-4 px-4">
                      {driver ? (
                        <div className="flex items-center gap-1.5 text-brand-green font-medium">
                          <UserCheck className="w-3.5 h-3.5" />
                          {driver.name}
                        </div>
                      ) : (
                        <span className="text-gray-500 font-mono text-[11px]">Unassigned</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          truck.trackingStatus === 'moving'
                            ? 'bg-brand-green/20 text-brand-green'
                            : truck.trackingStatus === 'stopped'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        â— {truck.trackingStatus}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          truck.status !== 'inactive'
                            ? 'bg-brand-green/10 text-brand-green'
                            : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {truck.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(truck)}
                          title="Edit Truck"
                          className="p-1.5 rounded-lg border border-dark-border text-gray-400 hover:text-white hover:bg-dark-card transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleTruckStatus(truck)}
                          title={truck.status !== 'inactive' ? 'Deactivate Truck' : 'Activate Truck'}
                          className={`p-1.5 rounded-lg border border-dark-border transition-colors ${
                            truck.status !== 'inactive'
                              ? 'text-amber-400 hover:bg-amber-500/10'
                              : 'text-brand-green hover:bg-brand-green/10'
                          }`}
                        >
                          {truck.status !== 'inactive' ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(truck)}
                          title="Delete Truck"
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

      {/* Add / Edit Truck Modal */}
      {modalOpen && (
        <TruckDialogFrame onClose={() => setModalOpen(false)}>
          <div className={`relative w-full max-w-lg rounded-3xl border shadow-2xl p-5 sm:p-6 transition-colors ${
            isDark ? 'bg-[#0B0F14] border-white/10 text-white' : 'bg-white border-gray-200 text-[#111827]'
          }`}>
            <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
              <h2 className="text-base font-bold flex items-center gap-2">
                <Truck className="w-4 h-4 text-brand-green" />
                {editingTruck ? `Edit Truck #${editingTruck.truckNumber}` : 'Add New Commercial Truck'}
              </h2>
              <button onClick={() => setModalOpen(false)} className={`p-1 rounded-lg ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5 text-xs">
              {formError && (
                <div role="alert" className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Truck Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 105"
                    value={formData.truckNumber}
                    onChange={(e) => setFormData({ ...formData, truckNumber: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2 border focus:outline-none focus:border-brand-green font-numbers ${
                      isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>License Plate Number</label>
                  <input
                    type="text"
                    placeholder="e.g. TX-991-KLR"
                    value={formData.plateNumber}
                    onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2 border focus:outline-none focus:border-brand-green font-numbers ${
                      isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Make</label>
                  <input
                    type="text"
                    placeholder="Freightliner"
                    value={formData.make}
                    onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2 border focus:outline-none focus:border-brand-green ${
                      isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Model</label>
                  <input
                    type="text"
                    placeholder="Cascadia"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2 border focus:outline-none focus:border-brand-green ${
                      isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Year</label>
                  <input
                    type="number"
                    min="1950"
                    max="2100"
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2 border focus:outline-none focus:border-brand-green font-numbers ${
                      isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <div>
                  <label className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>VIN (Optional)</label>
                  <input
                    type="text"
                    placeholder="17-character VIN"
                    value={formData.vin}
                    onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                    className={`w-full rounded-xl px-3 py-2 border focus:outline-none focus:border-brand-green font-numbers uppercase ${
                      isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Assign Driver</label>
                <select
                  value={formData.assignedDriverId}
                  onChange={(e) => setFormData({ ...formData, assignedDriverId: e.target.value })}
                  className={`w-full rounded-xl px-3 py-2 border focus:outline-none focus:border-brand-green ${
                    isDark ? 'bg-[#111827] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                  }`}
                >
                  <option value="">-- No Driver Assigned --</option>
                  {drivers.map((drv) => (
                    <option key={drv.id} value={drv.id}>
                      {drv.name} (ID: {drv.driverIdNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className={`pt-3 border-t flex justify-end gap-2 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className={`px-4 py-2 rounded-xl border ${
                    isDark ? 'border-white/10 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-brand-green text-black font-bold hover:bg-brand-green-hover shadow-md shadow-brand-green/20 disabled:opacity-60"
                >
                  {saving ? 'Savingâ€¦' : editingTruck ? 'Save Changes' : 'Register Truck'}
                </button>
              </div>
            </form>
          </div>
        </TruckDialogFrame>
      )}
    </div>
  );
}
